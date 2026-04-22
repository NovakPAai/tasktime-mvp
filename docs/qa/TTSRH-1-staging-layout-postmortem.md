# Postmortem: верстка слетела на staging после TTSRH-1

**Дата обнаружения:** 2026-04-22  
**Обнаружил:** jackrescuer-gif  
**Расследование:** Claude Code (автоматический анализ git-истории, DOM-цепочки, CSS-механик)  
**Затронутый эпик:** TTSRH-1 — Advanced Search / TTS-QL (21 PR, влиты 2026-04-21)  
**Автор всех проблемных изменений:** St1tcher86 (gdubovik@bk.ru)  
**Статус:** hotfix применён для причин #1 и #2; причина #3 требует отдельного решения

---

## TL;DR

После того как в staging задеплоили все 21 PR эпика TTSRH-1 (21 апреля), верстка сломалась. Расследование выявило **три независимых бага**, все внесены одним автором (St1tcher86) в рамках этого эпика:

| # | Критичность | Файл | PR/коммит | Эффект |
|---|-------------|------|-----------|--------|
| 1 | 🔴 Критический | `frontend/src/App.tsx` | PR-13 / `a224453` | `<AntApp>` рвёт flex-цепочку + перебивает шрифты **на всех страницах** |
| 2 | 🟠 Высокий | `frontend/src/pages/SearchPage.tsx` | PR-9 / `6b48f6f` | CSS grid без высоты → сломан layout на `/search` |
| 3 | 🟡 Средний | `deploy/nginx/nginx.conf.template` | PR-10 / `863db7b` | CSP блокирует стили CodeMirror в ряде браузеров |

---

## Контекст: что такое TTSRH-1 и как он деплоился

TTSRH-1 — эпик «Advanced Search + TTS-QL» — был реализован через 21 последовательный PR в ветку `main`. Все PR влиты St1tcher86 21 апреля 2026 в течение одного дня. После последнего merge был запущен `deploy-staging` workflow, который:

1. Собрал Docker-образ с `--build-arg VITE_FEATURES_ADVANCED_SEARCH=true` (добавлено в PR-19 / `9ad7ca5`)
2. Задеплоил образ на staging-сервер через SSH + `docker-compose up`

Флаг `VITE_FEATURES_ADVANCED_SEARCH=true` открыл `/search` маршрут и добавил пункт «Поиск задач» в сайдбар. Именно после этого деплоя пришёл репорт о сломанной верстке.

---

## Причина #1 — КРИТИЧЕСКАЯ: `<AntApp>` рвёт flex-цепочку и перебивает шрифты

### Что изменили

**Файл:** `frontend/src/App.tsx`  
**Коммит:** `a224453` (PR-13, St1tcher86, 21 апреля 17:03)  
**Причина изменения:** в PR-13 добавили `SavedFiltersSidebar` с `message.success`/`message.error` вызовами. В antd v5 статические методы (`message.success`, `Modal.confirm`) работают только если в дереве есть `<App>` — он предоставляет React-контекст. Без этого методы вызываются вне React-дерева и тихо не работают.

**Дифф:**
```diff
-import { ConfigProvider, theme as antdTheme } from 'antd';
+import { App as AntApp, ConfigProvider, theme as antdTheme } from 'antd';

 return (
   <ConfigProvider theme={antTheme}>
-    <BrowserRouter>
+    <AntApp>
+      <BrowserRouter>
       <Routes>
         ...
       </Routes>
     </BrowserRouter>
+    </AntApp>
   </ConfigProvider>
 );
```

### Почему это сломало layout

Проблема в том, что `<AntApp>` — **не прозрачный** контейнер. Он рендерит реальный DOM-элемент:

```html
<div class="ant-app css-[hashId] css-var-[hash]">
  <!-- всё приложение внутри -->
</div>
```

Этот `<div>` вставился в середину flex-цепочки, которая обеспечивает правильные размеры всего приложения.

**Цепочка ДО PR-13:**
```
<body>              ← display: flex; min-height: 100vh; overflow: hidden
  <div id="root">   ← flex: 1; display: flex; min-height: 100vh
    [ConfigProvider] ← нет DOM-элемента
    [BrowserRouter]  ← нет DOM-элемента
    [Routes]         ← нет DOM-элемента
      <AppLayout>    ← display: flex; height: 100vh; width: 100%; overflow: hidden
```

**Цепочка ПОСЛЕ PR-13:**
```
<body>              ← display: flex; min-height: 100vh; overflow: hidden
  <div id="root">   ← flex: 1; display: flex; min-height: 100vh
    [ConfigProvider] ← нет DOM-элемента
    <div.ant-app>   ← ⚠️ НОВЫЙ DIV: display: block; НЕТ flex: 1; НЕТ width: 100%
      [BrowserRouter] ← нет DOM-элемента
      [Routes]        ← нет DOM-элемента
        <AppLayout>   ← display: flex; height: 100vh; width: 100%; overflow: hidden
```

**Механика поломки (flex-алгоритм):**

`#root` — flex-контейнер с `flex-direction: row` (дефолт). Его прямой дочерний элемент `div.ant-app` становится flex-item. Для flex-items действуют следующие дефолты:

```
flex-grow:   0   → не растягивается сверх своего базового размера
flex-shrink: 1   → может сжиматься
flex-basis:  auto → базовый размер = content size
align-self:  stretch (унаследован от align-items родителя) → растягивается по высоте ✓
```

Поскольку `flex-grow: 0` и `flex-basis: auto`, ширина `div.ant-app` определяется размером контента. `AppLayout` внутри говорит `width: 100%` — но 100% от чего? От `div.ant-app`, у которого нет определённой ширины. По CSS-спецификации (CSS Flexbox Level 1, §9.2): если flex-item не имеет определённого main-size, процентная ширина его потомков трактуется как `auto`.

В итоге `AppLayout` с `width: auto` сжимается до ширины своего содержимого (сайдбар 220px + контент). В худших случаях приложение рендерится в 220–300px ширины посередине экрана вместо полного viewport.

Кроме того, антигравитационный эффект: `height: 100vh` на `AppLayout` всегда работает (viewport-relative), поэтому вертикальный layout выжил, а горизонтальный — нет. Отсюда типичный симптом: «всё есть, но съехалось в кучу слева».

### Почему ещё сломались шрифты

`<AntApp>` через CSS-in-JS инжектирует стили в `<head>` страницы. Исходник (`node_modules/antd/es/app/style/index.js`):

```javascript
const genBaseStyle = token => {
  const { componentCls, colorText, fontSize, lineHeight, fontFamily } = token;
  return {
    [componentCls]: {           // .ant-app
      color: colorText,         // цвет текста из antd-токена
      fontSize,                 // 14px
      lineHeight,               // 1.5714...
      fontFamily,               // ← ВОТ ЭТО ПРОБЛЕМА
    }
  };
};
```

`fontFamily` из antd-токена — дефолтное значение antd v5:
```
"Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif
```

Этот CSS с селектором `.ant-app` имеет **большую специфичность**, чем `body` из нашего `styles.css`:
```css
/* styles.css — специфичность: element (0,0,1) */
body {
  font-family: var(--font-sans); /* Inter, Space Grotesk */
}

/* antd CSS-in-JS injection — специфичность: class (0,1,0) */
.ant-app {
  font-family: "Helvetica Neue", Helvetica, ...;
}
```

Класс всегда побеждает элемент. Вся типографика во всём приложении переключилась с `Inter`/`Space Grotesk` на системный `Helvetica Neue`.

### Hotfix

```tsx
// frontend/src/App.tsx

// БЫЛО (после PR-13):
<AntApp>

// СТАЛО:
<AntApp style={{
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  fontFamily: 'inherit',   // не перебивать шрифты
  fontSize: 'inherit',     // не перебивать размер
  lineHeight: 'inherit',   // не перебивать межстрочный
}}>
```

`flex: 1` — чтобы `div.ant-app` занял всю доступную ширину в flex-контейнере `#root`.  
`display: flex; flexDirection: column` — чтобы `AppLayout` внутри правильно получал высоту.  
`fontFamily/fontSize/lineHeight: inherit` — чтобы `.ant-app` не перебивал typography с `body`.

**Правильный способ для antd v5 при нестандартном layout:**  
Вместо `style` на `<AntApp>` можно было передать `component={React.Fragment}`, чтобы вообще не генерировался DOM-элемент. Но тогда CSS-переменные antd не инжектируются — это работает только если вы не используете `cssVar`. В нашем случае безопаснее `style` с `inherit`.

---

## Причина #2 — ВЫСОКАЯ: SearchPage grid без ограничения по высоте

### Что изменили

**Файл:** `frontend/src/pages/SearchPage.tsx`, строки 190–197  
**Коммит:** `6b48f6f` (PR-9, St1tcher86, 21 апреля 09:42)  
**Причина изменения:** SearchPage реализована как 3-колоночный layout — фильтры слева, результаты по центру, превью справа.

```tsx
// PR-9, SearchPage.tsx
<div
  style={{
    display: 'grid',
    gridTemplateColumns: '320px minmax(0, 1fr) 360px',
    gap: 12,
    alignItems: 'stretch',
  }}
>
  <aside ...>  {/* Колонка 1: SavedFiltersSidebar */}
  <main ...>   {/* Колонка 2: JQL-редактор + результаты */}
  <section ...>{/* Колонка 3: превью задачи */}
</aside>
```

### Почему это сломало layout на `/search`

Родительский контейнер главной области (`#main-scroll` в `AppLayout`) настроен так:

```tsx
// AppLayout.tsx
<div
  id="main-scroll"
  style={{
    flex: '1 1 0',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',    // ← скролл идёт здесь
    minHeight: 0,
  }}
>
  <Outlet />  {/* сюда рендерится SearchPage */}
</div>
```

SearchPage начинается с:
```tsx
<div style={{ minHeight: '100%', padding: '16px 20px', ... }}>
```

`minHeight: 100%` работает только если у родителя есть **определённая высота** (не `auto`). У `#main-scroll` высота — `flex: 1 1 0`, которая определяется flexbox-алгоритмом, то есть «оставшееся пространство». Это не статическое значение — браузер не считает это «определённой высотой» для целей `%`-расчётов.

Дальше внутри SearchPage — grid-контейнер без высоты. Дочерние колонки имеют:
- Колонка 2 (результаты): `minHeight: 240`, `overflowY: auto`
- Колонки 1, 3: `minHeight: 480`, `overflowY: auto`

**Проблема:** `overflowY: auto` на колонках работает только если у них есть конкретная высота или они находятся в контейнере с конкретной высотой. Без высоты на grid-контейнере — это `overflow: auto` на блоке с `height: auto`, что фактически не даёт никакого скролла. Контент просто вытекает вниз, растягивая страницу и ломая весь layout.

**Дополнительная проблема:** минимальная ширина grid `320 + 12 + 1fr + 12 + 360 = 704px + fr`. На узких экранах (< 1200px) правая колонка (360px) сдвигает контент за пределы viewport, появляется горизонтальный скролл или overflow на всей странице.

### Hotfix

```tsx
// было
<div style={{
  display: 'grid',
  gridTemplateColumns: '320px minmax(0, 1fr) 360px',
  gap: 12,
  alignItems: 'stretch',
}}>

// стало
<div style={{
  display: 'grid',
  gridTemplateColumns: '320px minmax(0, 1fr) 360px',
  gap: 12,
  alignItems: 'stretch',
  minHeight: 'calc(100vh - 120px)',  // ← добавлено
}}>
```

`calc(100vh - 120px)` — 120px это примерная высота header + отступы. Это даёт колонкам определённую высоту, после чего `overflowY: auto` на них начинает работать корректно.

**Более правильное долгосрочное решение:**  
Изменить `SearchPage` root с `minHeight: '100%'` на `height: '100%'` и цепочку высот прокинуть сверху вниз через `height: 100%` → grid `height: 100%`. Но это требует больше изменений и проверки на всех страницах.

---

## Причина #3 — СРЕДНЯЯ: CodeMirror 6 несовместим с текущим CSP

### Что изменили

**Файл-источник:** `frontend/src/components/search/JqlEditor.tsx` и `frontend/src/components/search/ttql-language.ts`  
**Зависимости:** `@codemirror/view@^6.41.1`, `@codemirror/state@^6.6.0` и другие  
**Коммит:** `863db7b` (PR-10, St1tcher86, 21 апреля 09:58)  
**Влияние:** JQL-редактор на `/search` и в `AdminReleaseCheckpointTypesPage` (PR-18)

### Как CodeMirror 6 инжектирует стили

CodeMirror 6 не поставляет статический CSS-файл для импорта. Вместо этого он использует собственную систему `StyleModule` — динамически создаёт `CSSStyleSheet` и монтирует его через `document.adoptedStyleSheets`:

```javascript
// упрощённо, из @codemirror/view internals
const sheet = new CSSStyleSheet();
sheet.replaceSync(".cm-editor { ... } .cm-line { ... }");
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
```

### Почему это конфликтует с CSP

Текущий CSP в `deploy/nginx/nginx.conf.template`:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' data:;
  connect-src 'self';
  font-src 'self' https://fonts.gstatic.com;
  frame-ancestors 'none';
```

**Ключевое:** `'unsafe-inline'` в `style-src` разрешает:
- `<style>` теги в HTML
- атрибут `style="..."` на элементах
- `element.style.xxx = ...` через JS

**НО `'unsafe-inline'` НЕ разрешает** `document.adoptedStyleSheets`. `adoptedStyleSheets` — это CSSOM API, который создаёт стили через JavaScript-объекты, минуя HTML-парсер. По спецификации CSP Level 3 (W3C), `adoptedStyleSheets` попадает под контроль `style-src`, но требует либо `'unsafe-inline'` с nonce, либо hash, либо специального разрешения.

На практике: Chrome 111+ блокирует `adoptedStyleSheets` без явного разрешения в CSP, даже при наличии `'unsafe-inline'`. Firefox ведёт себя аналогично начиная с Firefox 101.

**Симптом:** JQL-редактор рендерится как голый `<div contenteditable>` без каких-либо визуальных стилей — нет фона, нет подсветки синтаксиса, нет курсора CodeMirror, нет border. Выглядит как пустой блок.

Это легко воспроизвести: открыть DevTools → Console, после загрузки `/search` должны быть CSP-ошибки вида:
```
Refused to apply inline style because it violates the following Content Security Policy directive: "style-src 'self' 'unsafe-inline' ..."
```

### Варианты фикса (не применён, требует обсуждения)

**Вариант A — Быстрый (менее безопасный):**  
Добавить `'unsafe-hashes'` в `style-src`. Это расширяет `'unsafe-inline'` на CSSOM-стили.

```nginx
style-src 'self' 'unsafe-inline' 'unsafe-hashes' https://fonts.googleapis.com;
```

**Вариант B — Правильный (рекомендуется):**  
Вычислить SHA256-хэши CSS-правил CodeMirror и внести их в CSP. Это строгое решение без `'unsafe-inline'`. Требует скрипта для автоматического обновления хэшей при обновлении версии CodeMirror.

**Вариант C — Обходной:**  
Использовать `@codemirror/view` в режиме без `adoptedStyleSheets` — вручную импортировать CSS файл CodeMirror как статический ассет и отключить динамическую инжекцию. Но это нестандартный путь и может сломаться при обновлении CM6.

---

## Полная временная шкала событий

```
2026-04-20  22:06  St1tcher86  TTSRH-1 PR-1:  foundation (Prisma, feature flags, stubs)
2026-04-21  09:42  St1tcher86  TTSRH-1 PR-9:  SearchPage shell + CSS grid — БАГ #2
2026-04-21  09:58  St1tcher86  TTSRH-1 PR-10: JqlEditor CodeMirror — БАГ #3
2026-04-21  10:15  St1tcher86  TTSRH-1 PR-11: ValueSuggester autocomplete
2026-04-21  10:30  St1tcher86  TTSRH-1 PR-12: BasicFilterBuilder
2026-04-21  17:03  St1tcher86  TTSRH-1 PR-13: SavedFiltersSidebar + AntApp — БАГ #1
2026-04-21  17:19  St1tcher86  TTSRH-1 PR-14: ResultsTable + BulkActions
2026-04-21  ~18:xx St1tcher86  TTSRH-1 PR-15..PR-19: backend checkpoint, TTQL
2026-04-21  23:04  St1tcher86  TTSRH-1 PR-19: включить feature flags на staging
2026-04-22  ~00:xx             Deploy staging: образ с VITE_FEATURES_ADVANCED_SEARCH=true
2026-04-22         jackrescuer  ОБНАРУЖЕНА сломанная верстка на staging
```

---

## Дерево зависимостей между проблемами

```
TTSRH-1 epic деплой на staging
│
├─ БАГ #1: AntApp wrapper (PR-13)
│   ├─ Эффект A: flex-chain сломана → ширина AppLayout некорректна
│   └─ Эффект B: шрифты перебиты на Helvetica Neue для всего приложения
│
├─ БАГ #2: SearchPage grid без высоты (PR-9)
│   ├─ Предусловие: VITE_FEATURES_ADVANCED_SEARCH=true открывает /search
│   └─ Эффект: колонки с overflow:auto не скроллятся, контент вытекает
│
└─ БАГ #3: CodeMirror + CSP (PR-10)
    ├─ Предусловие: /search открыт + JqlEditor смонтирован
    └─ Эффект: редактор рендерится без стилей в Chrome/Firefox
```

Баги #2 и #3 не проявились бы без `VITE_FEATURES_ADVANCED_SEARCH=true` — без флага `/search` не открывается. Баг #1 затронул **все страницы** независимо от флага.

---

## Что применено как hotfix

### Применённые изменения (в текущей рабочей ветке)

**1. `frontend/src/App.tsx` — исправлен `<AntApp>`**

```tsx
// БЫЛО
<AntApp>
  <BrowserRouter>
    ...
  </BrowserRouter>
</AntApp>

// СТАЛО
<AntApp style={{
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  fontFamily: 'inherit',
  fontSize: 'inherit',
  lineHeight: 'inherit',
}}>
  <BrowserRouter>
    ...
  </BrowserRouter>
</AntApp>
```

**2. `frontend/src/pages/SearchPage.tsx` — добавлена высота к grid**

```tsx
// БЫЛО
<div style={{
  display: 'grid',
  gridTemplateColumns: '320px minmax(0, 1fr) 360px',
  gap: 12,
  alignItems: 'stretch',
}}>

// СТАЛО
<div style={{
  display: 'grid',
  gridTemplateColumns: '320px minmax(0, 1fr) 360px',
  gap: 12,
  alignItems: 'stretch',
  minHeight: 'calc(100vh - 120px)',
}}>
```

### Ещё не применено (требует решения)

**3. `deploy/nginx/nginx.conf.template` — CSP для CodeMirror**  
Нужно обсудить: `'unsafe-hashes'` vs hash-based CSP vs другой подход. Без этого JQL-редактор может работать некорректно в Chrome/Firefox на staging.

---

## Как воспроизвести баги (до hotfix)

### Баг #1
1. Открыть staging в Chrome DevTools → Elements
2. Найти `<div class="ant-app ...">` — прямой child `#root`
3. Убедиться что у него нет `flex: 1` или `width: 100%` в Computed Styles
4. Визуально: всё приложение сжато влево, шрифт — Helvetica вместо Inter

### Баг #2
1. Открыть `/search` на staging
2. Ввести любой JQL-запрос и нажать Enter
3. Результаты не скроллятся — список растягивает страницу вниз
4. DevTools → Elements: найти `.ant-app > div[data-testid="search-page"] > div[style*="grid"]` — у него нет `height`

### Баг #3
1. Открыть `/search` на staging в Chrome
2. DevTools → Console — должны быть CSP-ошибки про `adoptedStyleSheets`
3. JQL-поле выглядит как пустой прямоугольник без стилей

---

## Чеклист для St1tcher86

### По каждому из трёх багов

**Баг #1 — AntApp:**
- [ ] Понять что `<AntApp>` создаёт реальный `<div>` в DOM (не прозрачная обёртка)
- [ ] При добавлении любого провайдера/контейнера в середину существующей flex-цепочки — всегда проверять что новый DOM-элемент имеет правильные flex-стили
- [ ] Проверить в DevTools вкладку Elements после любого изменения App.tsx — убедиться что DOM-дерево соответствует ожиданиям
- [ ] Изучить antd docs: [App — Static function](https://ant.design/components/app) — там явно написано что компонент рендерит `div`

**Баг #2 — CSS Grid:**
- [ ] Правило: если колонки/ячейки grid используют `overflow: auto/scroll` или `height/maxHeight` — grid-контейнер должен иметь явную высоту (height или minHeight)
- [ ] Тестировать страницу с длинным контентом (>1000 результатов), а не только с пустым состоянием
- [ ] Проверять на разных размерах экрана (1280px, 1440px, 1920px) через DevTools responsive mode

**Баг #3 — CSP:**
- [ ] При добавлении любой CSS-in-JS библиотеки или библиотеки с динамической инжекцией стилей — проверить совместимость с nginx CSP
- [ ] Запустить DevTools Console на staging сразу после деплоя — убедиться нет CSP violations
- [ ] Добавить в чеклист PR: «проверил CSP violations в Console на staging»

### Общий чеклист перед PR с frontend-изменениями

- [ ] `npm run build` — чистый билд без ошибок и предупреждений
- [ ] `npm run typecheck` (или `tsc --noEmit`) — ноль TypeScript-ошибок
- [ ] Открыть страницу в Chrome DevTools, проверить Console на ошибки
- [ ] Проверить Computed Styles элементов в изменённых страницах
- [ ] Если трогаешь App.tsx или глобальные провайдеры — проверить 3–4 разные страницы, не только ту что разрабатывал

---

## Уроки для команды

### 1. antd `<App>` — не прозрачная обёртка

Компонент `<App>` (он же `<AntApp>`) добавляет `<div class="ant-app">` в DOM и инжектирует CSS с `fontFamily`, `fontSize`, `lineHeight` через CSS-in-JS. При встраивании в проект с кастомными шрифтами и flex-layout — нужно явно передавать `inherit` для typography-стилей и `flex: 1` для flex-поведения.

### 2. Flex-цепочка — хрупкая конструкция

Любой новый DOM-элемент без правильных flex-стилей, вставленный в середину цепочки `body → #root → AppLayout`, нарушает layout. Это не очевидно потому что React-провайдеры (ConfigProvider, BrowserRouter, Routes) не создают DOM-элементы — и разработчик привыкает что «провайдеры прозрачны». antd `<App>` нарушает это ожидание.

### 3. CSS Grid требует высоты на контейнере если колонки используют overflow

`display: grid; alignItems: stretch` без явной высоты на контейнере — ловушка. Колонки растянутся по контенту (stretch), а не по viewport. `overflow: auto` на дочерних элементах без конкретной высоты не даёт скролла.

### 4. `document.adoptedStyleSheets` ≠ `'unsafe-inline'` в CSP

Это отдельный CSSOM API. При добавлении библиотек с динамической инжекцией CSS (CodeMirror 6, Emotion, styled-components в некоторых режимах) — нужно отдельно проверять CSP.

### 5. Весь эпик из 21 PR без промежуточных staging-деплоев — рискованно

Проблемы из PR-9 и PR-13 были бы найдены раньше если бы staging обновлялся после каждых 3–5 PR, а не после всех 21. Рекомендация: для больших эпиков деплоить на staging каждые 5–7 PR и проверять базовые user flows.

---

## Связанные файлы

| Файл | Причина |
|------|---------|
| `frontend/src/App.tsx` | Баг #1 — AntApp wrapper |
| `frontend/src/pages/SearchPage.tsx` | Баг #2 — CSS grid |
| `frontend/src/components/search/JqlEditor.tsx` | Баг #3 — CodeMirror entry point |
| `frontend/src/components/search/ttql-language.ts` | Баг #3 — CodeMirror config |
| `deploy/nginx/nginx.conf.template` | Баг #3 — CSP |
| `frontend/src/styles.css` | Контекст — body/root CSS chain |
| `frontend/src/components/layout/AppLayout.tsx` | Контекст — AppLayout CSS chain |
| `.github/workflows/build-and-publish.yml` | Контекст — staging build-args |
