/**
 * TTSRH-1 — справка по TTS-QL в формате Atlassian "Advanced searching reference".
 *
 * Страница открывается в отдельной вкладке по ссылке из хедера `/search`.
 * Источник — §5 ТЗ TTSRH-1 (grammar, fields, functions, operators, examples).
 * Цель — дать пользователю автономный reference по языку, не требующий доступа к
 * git / GitHub / внешним ресурсам: всё необходимое — inline.
 */
import { useMemo } from 'react';

import { useThemeStore } from '../store/theme.store';

type Section = { id: string; title: string };

const SECTIONS: Section[] = [
  { id: 'overview', title: '1. Введение' },
  { id: 'structure', title: '2. Структура запроса' },
  { id: 'precedence', title: '3. Приоритет и регистр' },
  { id: 'types', title: '4. Типы данных' },
  { id: 'operators', title: '5. Операторы' },
  { id: 'keywords', title: '6. Ключевые слова' },
  { id: 'fields', title: '7. Поля' },
  { id: 'custom-fields', title: '8. Кастомные поля' },
  { id: 'functions', title: '9. Функции' },
  { id: 'order-by', title: '10. Сортировка (ORDER BY)' },
  { id: 'saved-filters', title: '11. Сохранённые фильтры' },
  { id: 'examples', title: '12. Готовые примеры' },
  { id: 'limits', title: '13. Ограничения' },
];

export default function SearchHelpPage() {
  const { mode } = useThemeStore();
  const isLight = mode === 'light';
  const c = useMemo(
    () =>
      isLight
        ? {
            bg: '#F6F8FA',
            panel: '#FFFFFF',
            border: '#D0D7DE',
            borderSoft: '#E4E8EE',
            t1: '#1F2328',
            t2: '#424A53',
            t3: '#656D76',
            acc: '#4F6EF7',
            codeBg: '#F0F3F6',
            codeT: '#0550AE',
            tableHead: '#F6F8FA',
          }
        : {
            bg: '#080B14',
            panel: '#0F1320',
            border: '#21262D',
            borderSoft: '#1A1F2A',
            t1: '#E2E8F8',
            t2: '#B1BAC4',
            t3: '#8B949E',
            acc: '#4F6EF7',
            codeBg: '#111827',
            codeT: '#79C0FF',
            tableHead: '#0B1020',
          },
    [isLight],
  );

  const codeStyle: React.CSSProperties = {
    display: 'inline-block',
    background: c.codeBg,
    color: c.codeT,
    padding: '1px 6px',
    borderRadius: 4,
    fontFamily: '"JetBrains Mono", Menlo, Consolas, monospace',
    fontSize: 12,
    lineHeight: 1.5,
  };

  const pre: React.CSSProperties = {
    background: c.codeBg,
    color: c.t1,
    padding: '12px 14px',
    borderRadius: 6,
    fontFamily: '"JetBrains Mono", Menlo, Consolas, monospace',
    fontSize: 12.5,
    lineHeight: 1.55,
    overflowX: 'auto',
    margin: '8px 0 14px',
    border: `1px solid ${c.border}`,
    whiteSpace: 'pre',
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
    margin: '6px 0 18px',
  };
  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: `2px solid ${c.border}`,
    background: c.tableHead,
    color: c.t2,
    fontWeight: 600,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  };
  const tdStyle: React.CSSProperties = {
    padding: '8px 10px',
    borderBottom: `1px solid ${c.borderSoft}`,
    verticalAlign: 'top',
    color: c.t1,
  };

  const h2: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 600,
    margin: '32px 0 8px',
    color: c.t1,
    scrollMarginTop: 16,
  };
  const h3: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 600,
    margin: '20px 0 6px',
    color: c.t1,
  };
  const p: React.CSSProperties = {
    margin: '8px 0',
    color: c.t2,
    fontSize: 13.5,
    lineHeight: 1.6,
  };
  const note: React.CSSProperties = {
    background: isLight ? '#EFF4FF' : '#141C33',
    border: `1px solid ${isLight ? '#BFD0FF' : '#2B3658'}`,
    padding: '10px 12px',
    borderRadius: 6,
    margin: '8px 0 14px',
    color: c.t1,
    fontSize: 13,
  };

  return (
    <div
      style={{
        minHeight: '100%',
        padding: '24px 28px 80px',
        background: c.bg,
        color: c.t1,
        fontFamily: '"Inter", system-ui, sans-serif',
        fontSize: 13,
        lineHeight: 1.55,
      }}
      data-testid="search-help-page"
    >
      <header style={{ marginBottom: 20 }}>
        <div style={{ color: c.t3, fontSize: 12, letterSpacing: 0.3, marginBottom: 6 }}>
          TaskTime · Документация
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: c.t1 }}>
          TTS-QL — расширенный поиск задач
        </h1>
        <p style={{ ...p, maxWidth: 860, marginTop: 8 }}>
          TTS-QL (TaskTime Query Language) — текстовый язык запросов для фильтрации задач
          в TaskTime. Синтаксис совместим с Atlassian JQL для ≥&nbsp;95% выражений: знакомые
          команды работают без изменений. На этой странице — полный справочник: грамматика,
          поля, операторы, функции и примеры вызовов. Страница автономна — копируйте в
          закладки, открывается без подключения к внешним ресурсам.
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '260px minmax(0, 1fr)',
          gap: 28,
          alignItems: 'start',
        }}
      >
        {/* ── Sticky TOC ─────────────────────────────────────────────── */}
        <nav
          aria-label="Оглавление"
          style={{
            position: 'sticky',
            top: 16,
            background: c.panel,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            padding: '14px 10px',
            fontSize: 13,
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              color: c.t3,
              padding: '0 6px 8px',
            }}
          >
            На этой странице
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  style={{
                    display: 'block',
                    padding: '6px 10px',
                    color: c.t2,
                    textDecoration: 'none',
                    borderRadius: 4,
                    fontSize: 13,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = c.borderSoft)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* ── Main content ───────────────────────────────────────────── */}
        <main
          style={{
            background: c.panel,
            border: `1px solid ${c.border}`,
            borderRadius: 10,
            padding: '24px 28px',
            maxWidth: 960,
          }}
        >
          {/* 1. Введение */}
          <section id="overview">
            <h2 style={h2}>1. Введение</h2>
            <p style={p}>
              TTS-QL позволяет описывать фильтры задач в виде логических выражений. В
              простейшем виде запрос состоит из условий на поля, соединённых ключевыми
              словами <code style={codeStyle}>AND</code> / <code style={codeStyle}>OR</code>{' '}
              / <code style={codeStyle}>NOT</code>, и опциональной сортировки{' '}
              <code style={codeStyle}>ORDER BY</code>.
            </p>
            <p style={p}>
              Редактор поддерживает подсветку синтаксиса, inline-подсказки после операторов и
              автодополнение значений (email исполнителя, ключ проекта, цвет статуса и т.п.).
              Синтаксис максимально близок к Atlassian JQL — большинство шаблонов переносятся
              дословно.
            </p>
            <div style={note}>
              <strong>Где доступно.</strong> Страница <code style={codeStyle}>/search</code>{' '}
              (пункт меню «Поиск задач»), а также внутри контрольных точек (КТ) как
              альтернатива structured-критериям — см. раздел 12.
            </div>
          </section>

          {/* 2. Структура */}
          <section id="structure">
            <h2 style={h2}>2. Структура запроса</h2>
            <p style={p}>Каждое условие имеет форму:</p>
            <pre style={pre}>{`поле  оператор  значение`}</pre>
            <p style={p}>Пример простейшего запроса:</p>
            <pre style={pre}>{`project = TTMP AND assignee = currentUser()`}</pre>
            <p style={p}>Грамматика в нотации EBNF:</p>
            <pre style={pre}>{`query      ::= or_expr [ "ORDER BY" sort_list ]
or_expr    ::= and_expr { "OR" and_expr }
and_expr   ::= not_expr { "AND" not_expr }
not_expr   ::= [ "NOT" ] atom
atom       ::= "(" query ")" | clause
clause     ::= field  cmp_op  value
             | field  "IN"    "(" value_list ")"
             | field  "IS"    [ "NOT" ]  ( "EMPTY" | "NULL" )

cmp_op     ::= "=" | "!=" | ">" | ">=" | "<" | "<=" | "~" | "!~"
sort_list  ::= field [ "ASC" | "DESC" ] { "," field [ "ASC" | "DESC" ] }`}</pre>
          </section>

          {/* 3. Приоритет и регистр */}
          <section id="precedence">
            <h2 style={h2}>3. Приоритет и регистр</h2>
            <ul style={{ ...p, paddingLeft: 20 }}>
              <li>
                <strong>Приоритет:</strong> <code style={codeStyle}>( )</code> &gt;{' '}
                <code style={codeStyle}>NOT</code> &gt; <code style={codeStyle}>AND</code>{' '}
                &gt; <code style={codeStyle}>OR</code> &gt;{' '}
                <code style={codeStyle}>ORDER BY</code>. Скобки изменяют порядок явно.
              </li>
              <li>
                <strong>Регистронезависимость:</strong> ключевые слова (
                <code style={codeStyle}>AND</code>, <code style={codeStyle}>OR</code>,{' '}
                <code style={codeStyle}>IN</code>, <code style={codeStyle}>IS</code>,{' '}
                <code style={codeStyle}>EMPTY</code>, <code style={codeStyle}>ORDER</code>,{' '}
                <code style={codeStyle}>BY</code>, <code style={codeStyle}>NOT</code>) и имена
                полей — без учёта регистра. <code style={codeStyle}>assignee = currentUser()</code>{' '}
                эквивалентен <code style={codeStyle}>ASSIGNEE = CURRENTUSER()</code>.
              </li>
              <li>
                <strong>Комментарии:</strong> <code style={codeStyle}>-- …</code> до конца
                строки. Удобно в больших сохранённых фильтрах.
              </li>
            </ul>
          </section>

          {/* 4. Типы данных */}
          <section id="types">
            <h2 style={h2}>4. Типы данных</h2>
            <p style={p}>
              Каждое поле принимает значения одного или нескольких типов. Ниже — справочник
              типов, примеры записи и примеры вызовов в запросах.
            </p>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Тип</th>
                  <th style={thStyle}>Как записывается</th>
                  <th style={thStyle}>Пример вызова в запросе</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>
                    <strong>STRING</strong>
                  </td>
                  <td style={tdStyle}>
                    В двойных или одинарных кавычках. Экранирование: <code style={codeStyle}>\"</code>,{' '}
                    <code style={codeStyle}>\\</code>, <code style={codeStyle}>\n</code>,{' '}
                    <code style={codeStyle}>\t</code>, <code style={codeStyle}>\u{'{HEX}'}</code>.
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'summary ~ "payment gateway"'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <strong>NUMBER</strong>
                  </td>
                  <td style={tdStyle}>
                    Целое или дробное. Допускается знак. Без кавычек.
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'estimatedHours >= 8'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <strong>DATE</strong>
                  </td>
                  <td style={tdStyle}>
                    ISO-8601: <code style={codeStyle}>"YYYY-MM-DD"</code> или{' '}
                    <code style={codeStyle}>"YYYY-MM-DD HH:MM[:SS]"</code>.
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'due <= "2026-05-01"'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <strong>RELATIVE DATE</strong>
                  </td>
                  <td style={tdStyle}>
                    Смещение от <code style={codeStyle}>now()</code>. Единицы:{' '}
                    <code style={codeStyle}>d</code>, <code style={codeStyle}>w</code>,{' '}
                    <code style={codeStyle}>M</code>, <code style={codeStyle}>y</code>,{' '}
                    <code style={codeStyle}>h</code>, <code style={codeStyle}>m</code>.
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'updated >= "-7d"'}</code>
                    <div style={{ color: c.t3, fontSize: 12, marginTop: 4 }}>
                      эквивалент <code style={codeStyle}>updated &gt;= now() - 7d</code>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <strong>BOOL</strong>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>true</code> / <code style={codeStyle}>false</code>, без
                    кавычек.
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'hasCheckpointViolation = true'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <strong>IDENT</strong>
                  </td>
                  <td style={tdStyle}>
                    Системные ключи (<code style={codeStyle}>OPEN</code>,{' '}
                    <code style={codeStyle}>HIGH</code>, <code style={codeStyle}>TTMP</code>,{' '}
                    <code style={codeStyle}>BUG</code>). Без кавычек.
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'priority = CRITICAL AND type = BUG'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <strong>LIST</strong>
                  </td>
                  <td style={tdStyle}>
                    Массив значений в скобках через запятую. Используется с{' '}
                    <code style={codeStyle}>IN</code> / <code style={codeStyle}>NOT IN</code>.
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'status IN (OPEN, IN_PROGRESS, REVIEW)'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <strong>FUNCTION</strong>
                  </td>
                  <td style={tdStyle}>
                    Вызов функции: имя + <code style={codeStyle}>()</code>. Может возвращать
                    скаляр или список.
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'assignee = currentUser()'}</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* 5. Операторы */}
          <section id="operators">
            <h2 style={h2}>5. Операторы</h2>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Оператор</th>
                  <th style={thStyle}>Применимые типы</th>
                  <th style={thStyle}>Семантика</th>
                  <th style={thStyle}>Пример</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>=</code>, <code style={codeStyle}>!=</code>
                  </td>
                  <td style={tdStyle}>все</td>
                  <td style={tdStyle}>равенство / неравенство</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'status = DONE'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>&gt;</code>, <code style={codeStyle}>&gt;=</code>,{' '}
                    <code style={codeStyle}>&lt;</code>, <code style={codeStyle}>&lt;=</code>
                  </td>
                  <td style={tdStyle}>NUMBER, DATE, DATETIME</td>
                  <td style={tdStyle}>сравнение</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'created >= "2026-04-01"'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>IN</code>
                  </td>
                  <td style={tdStyle}>перечислимые (Enum, Ref, LIST)</td>
                  <td style={tdStyle}>вхождение в список</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'project IN (TTMP, TTSRH)'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>NOT IN</code>
                  </td>
                  <td style={tdStyle}>перечислимые</td>
                  <td style={tdStyle}>отсутствие в списке</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'status NOT IN (DONE, CANCELLED)'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>~</code>
                  </td>
                  <td style={tdStyle}>TEXT / TEXTAREA / URL</td>
                  <td style={tdStyle}>
                    ILIKE — подстрока (эквивалент <code style={codeStyle}>%bug%</code>)
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'summary ~ "timeout"'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>!~</code>
                  </td>
                  <td style={tdStyle}>TEXT</td>
                  <td style={tdStyle}>отрицание ILIKE</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'description !~ "draft"'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>IS EMPTY</code>,{' '}
                    <code style={codeStyle}>IS NULL</code>
                  </td>
                  <td style={tdStyle}>nullable-поля</td>
                  <td style={tdStyle}>поле пустое</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'assignee IS EMPTY'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>IS NOT EMPTY</code>,{' '}
                    <code style={codeStyle}>IS NOT NULL</code>
                  </td>
                  <td style={tdStyle}>nullable-поля</td>
                  <td style={tdStyle}>поле заполнено</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'due IS NOT EMPTY'}</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* 6. Ключевые слова */}
          <section id="keywords">
            <h2 style={h2}>6. Ключевые слова</h2>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Слово</th>
                  <th style={thStyle}>Назначение</th>
                  <th style={thStyle}>Пример</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>AND</code>
                  </td>
                  <td style={tdStyle}>логическое «и»</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'priority = HIGH AND assignee IS EMPTY'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>OR</code>
                  </td>
                  <td style={tdStyle}>логическое «или»</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'priority = CRITICAL OR due <= "1d"'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>NOT</code>
                  </td>
                  <td style={tdStyle}>отрицание</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'NOT (status = DONE)'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>IN</code> / <code style={codeStyle}>NOT IN</code>
                  </td>
                  <td style={tdStyle}>вхождение в множество</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'type IN (BUG, STORY)'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>IS</code> / <code style={codeStyle}>IS NOT</code>
                  </td>
                  <td style={tdStyle}>
                    проверка <code style={codeStyle}>EMPTY</code> /{' '}
                    <code style={codeStyle}>NULL</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'sprint IS NOT EMPTY'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>ORDER BY</code>
                  </td>
                  <td style={tdStyle}>сортировка результата</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'ORDER BY priority DESC, updated DESC'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>ASC</code> / <code style={codeStyle}>DESC</code>
                  </td>
                  <td style={tdStyle}>
                    направление сортировки (по умолчанию <code style={codeStyle}>ASC</code>)
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'ORDER BY created ASC'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>EMPTY</code> / <code style={codeStyle}>NULL</code>
                  </td>
                  <td style={tdStyle}>сентинел-значения для IS-проверок</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'fixVersion IS EMPTY'}</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* 7. Поля */}
          <section id="fields">
            <h2 style={h2}>7. Поля</h2>
            <p style={p}>
              Поля сгруппированы по смыслу. Для каждого указаны: синонимы, тип, операторы и
              пример вызова. Имена полей регистронезависимы.
            </p>

            <h3 style={h3}>7.1 Задача</h3>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Поле</th>
                  <th style={thStyle}>Синонимы</th>
                  <th style={thStyle}>Тип</th>
                  <th style={thStyle}>Операторы</th>
                  <th style={thStyle}>Пример</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>project</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>proj</code>
                  </td>
                  <td style={tdStyle}>Project-ref</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>=</code>, <code style={codeStyle}>!=</code>,{' '}
                    <code style={codeStyle}>IN</code>, <code style={codeStyle}>NOT IN</code>,{' '}
                    <code style={codeStyle}>IS [NOT] EMPTY</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'project = TTMP'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>key</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>issuekey</code>
                  </td>
                  <td style={tdStyle}>Issue-ref</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>=</code>, <code style={codeStyle}>!=</code>,{' '}
                    <code style={codeStyle}>IN</code>, <code style={codeStyle}>NOT IN</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'key = "TTMP-123"'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>summary</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>title</code>
                  </td>
                  <td style={tdStyle}>TEXT</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>~</code>, <code style={codeStyle}>!~</code>,{' '}
                    <code style={codeStyle}>=</code>, <code style={codeStyle}>!=</code>,{' '}
                    <code style={codeStyle}>IS [NOT] EMPTY</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'summary ~ "timeout"'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>description</code>
                  </td>
                  <td style={tdStyle}>—</td>
                  <td style={tdStyle}>TEXT</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>~</code>, <code style={codeStyle}>!~</code>,{' '}
                    <code style={codeStyle}>IS [NOT] EMPTY</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'description ~ "regression"'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>status</code>
                  </td>
                  <td style={tdStyle}>—</td>
                  <td style={tdStyle}>Status-ref</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>=</code>, <code style={codeStyle}>!=</code>,{' '}
                    <code style={codeStyle}>IN</code>, <code style={codeStyle}>NOT IN</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'status IN (OPEN, IN_PROGRESS)'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>statusCategory</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>category</code>
                  </td>
                  <td style={tdStyle}>Enum</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>=</code>, <code style={codeStyle}>!=</code>,{' '}
                    <code style={codeStyle}>IN</code>, <code style={codeStyle}>NOT IN</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'statusCategory != DONE'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>priority</code>
                  </td>
                  <td style={tdStyle}>—</td>
                  <td style={tdStyle}>Enum</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>=</code>, <code style={codeStyle}>!=</code>,{' '}
                    <code style={codeStyle}>IN</code>, <code style={codeStyle}>NOT IN</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'priority IN (CRITICAL, HIGH)'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>type</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>issuetype</code>
                  </td>
                  <td style={tdStyle}>Type-ref</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>=</code>, <code style={codeStyle}>!=</code>,{' '}
                    <code style={codeStyle}>IN</code>, <code style={codeStyle}>NOT IN</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'type = BUG'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>parent</code>
                  </td>
                  <td style={tdStyle}>—</td>
                  <td style={tdStyle}>Issue-ref</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>=</code>, <code style={codeStyle}>!=</code>,{' '}
                    <code style={codeStyle}>IN</code>, <code style={codeStyle}>IS [NOT] EMPTY</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'parent = "TTMP-10"'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>epic</code>
                  </td>
                  <td style={tdStyle}>—</td>
                  <td style={tdStyle}>Issue-ref</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>=</code>, <code style={codeStyle}>IN</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'epic = "TTMP-42"'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>labels</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>label</code>
                  </td>
                  <td style={tdStyle}>LIST (text)</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>=</code>, <code style={codeStyle}>!=</code>,{' '}
                    <code style={codeStyle}>IN</code>, <code style={codeStyle}>NOT IN</code>,{' '}
                    <code style={codeStyle}>IS [NOT] EMPTY</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'labels IN ("hotfix", "security")'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>comment</code>
                  </td>
                  <td style={tdStyle}>—</td>
                  <td style={tdStyle}>TEXT</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>~</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'comment ~ "rollback"'}</code>
                  </td>
                </tr>
              </tbody>
            </table>

            <h3 style={h3}>7.2 Люди</h3>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Поле</th>
                  <th style={thStyle}>Тип</th>
                  <th style={thStyle}>Формат значения</th>
                  <th style={thStyle}>Пример</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>assignee</code>
                  </td>
                  <td style={tdStyle}>User-ref</td>
                  <td style={tdStyle}>email / id / функция</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'assignee = currentUser()'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>reporter</code>
                  </td>
                  <td style={tdStyle}>User-ref</td>
                  <td style={tdStyle}>email / id</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'reporter = "alice@example.com"'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>creator</code>
                  </td>
                  <td style={tdStyle}>User-ref</td>
                  <td style={tdStyle}>email / id</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'creator IN membersOf("qa")'}</code>
                  </td>
                </tr>
              </tbody>
            </table>

            <h3 style={h3}>7.3 Планирование и время</h3>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Поле</th>
                  <th style={thStyle}>Синонимы</th>
                  <th style={thStyle}>Тип</th>
                  <th style={thStyle}>Пример</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>sprint</code>
                  </td>
                  <td style={tdStyle}>—</td>
                  <td style={tdStyle}>Sprint-ref</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'sprint IN openSprints()'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>release</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>fixVersion</code>
                  </td>
                  <td style={tdStyle}>Release-ref</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'release = "TTMP-5.0"'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>due</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>dueDate</code>
                  </td>
                  <td style={tdStyle}>DATE</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'due <= "7d"'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>created</code>
                  </td>
                  <td style={tdStyle}>—</td>
                  <td style={tdStyle}>DATETIME</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'created >= startOfMonth()'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>updated</code>
                  </td>
                  <td style={tdStyle}>—</td>
                  <td style={tdStyle}>DATETIME</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'updated >= "-14d"'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>resolvedAt</code>
                  </td>
                  <td style={tdStyle}>—</td>
                  <td style={tdStyle}>DATETIME</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'resolvedAt >= startOfWeek()'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>estimatedHours</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>originalEstimate</code>
                  </td>
                  <td style={tdStyle}>NUMBER</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'estimatedHours > 8'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>timeSpent</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>workLog</code>
                  </td>
                  <td style={tdStyle}>NUMBER</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'timeSpent >= 16'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>timeRemaining</code>
                  </td>
                  <td style={tdStyle}>—</td>
                  <td style={tdStyle}>NUMBER</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'timeRemaining <= 0'}</code>
                  </td>
                </tr>
              </tbody>
            </table>

            <h3 style={h3}>7.4 AI</h3>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Поле</th>
                  <th style={thStyle}>Тип</th>
                  <th style={thStyle}>Значения</th>
                  <th style={thStyle}>Пример</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>aiEligible</code>
                  </td>
                  <td style={tdStyle}>BOOL</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>true</code> / <code style={codeStyle}>false</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'aiEligible = true'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>aiStatus</code>
                  </td>
                  <td style={tdStyle}>Enum</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>NOT_STARTED</code> /{' '}
                    <code style={codeStyle}>IN_PROGRESS</code> / <code style={codeStyle}>DONE</code>{' '}
                    / <code style={codeStyle}>FAILED</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'aiStatus IN (IN_PROGRESS, FAILED)'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>aiAssigneeType</code>
                  </td>
                  <td style={tdStyle}>Enum</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>HUMAN</code> / <code style={codeStyle}>AGENT</code> /{' '}
                    <code style={codeStyle}>MIXED</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'aiAssigneeType = AGENT'}</code>
                  </td>
                </tr>
              </tbody>
            </table>

            <h3 style={h3}>7.5 Контрольные точки (КТ)</h3>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Поле</th>
                  <th style={thStyle}>Синонимы</th>
                  <th style={thStyle}>Тип</th>
                  <th style={thStyle}>Пример</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>hasCheckpointViolation</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>hasViolation</code>
                  </td>
                  <td style={tdStyle}>BOOL</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'hasCheckpointViolation = true'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>checkpointViolationType</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>violationType</code>
                  </td>
                  <td style={tdStyle}>LIST (text)</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'checkpointViolationType = "Go-live"'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>checkpointViolationReason</code>
                  </td>
                  <td style={tdStyle}>—</td>
                  <td style={tdStyle}>TEXT</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'checkpointViolationReason ~ "assignee"'}</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* 8. Кастомные поля */}
          <section id="custom-fields">
            <h2 style={h2}>8. Кастомные поля</h2>
            <p style={p}>
              Кастомные поля вызываются двумя способами — по имени в кавычках (регистр не
              учитывается) или по UUID через <code style={codeStyle}>cf[…]</code>:
            </p>
            <pre style={pre}>{`"Story Points" > 3
cf[8f4c2e1e-aa4b-47c3-b2da-7a9c5e3f2d11] = "Design Review"`}</pre>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Тип поля</th>
                  <th style={thStyle}>Операторы</th>
                  <th style={thStyle}>Пример вызова</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>TEXT / TEXTAREA / URL</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>~</code>, <code style={codeStyle}>=</code>,{' '}
                    <code style={codeStyle}>!=</code>, <code style={codeStyle}>IS [NOT] EMPTY</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'"Тех. долг" ~ "миграция"'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>NUMBER / DECIMAL</td>
                  <td style={tdStyle}>все числовые</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'"Story Points" >= 5 AND "Story Points" <= 13'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>DATE / DATETIME</td>
                  <td style={tdStyle}>все временные</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'"Review Date" >= startOfWeek()'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>CHECKBOX</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>=</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'"Design Review Required" = true'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>SELECT</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>=</code>, <code style={codeStyle}>!=</code>,{' '}
                    <code style={codeStyle}>IN</code>, <code style={codeStyle}>NOT IN</code>{' '}
                    (option name или id)
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'"Severity" = "Blocker"'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>MULTI_SELECT / LABEL</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>=</code>, <code style={codeStyle}>!=</code>,{' '}
                    <code style={codeStyle}>IN</code>, <code style={codeStyle}>NOT IN</code>{' '}
                    (вхождение)
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'"Release Milestone" IN ("Beta", "GA")'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>USER</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>=</code>, <code style={codeStyle}>!=</code>,{' '}
                    <code style={codeStyle}>IN</code>, <code style={codeStyle}>NOT IN</code>,{' '}
                    <code style={codeStyle}>currentUser()</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'"Tech Lead" = currentUser()'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>REFERENCE</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>=</code>, <code style={codeStyle}>!=</code>,{' '}
                    <code style={codeStyle}>IN</code> (по id)
                  </td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'"Related Epic" = "TTMP-42"'}</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* 9. Функции */}
          <section id="functions">
            <h2 style={h2}>9. Функции</h2>
            <p style={p}>
              Функции вызываются как <code style={codeStyle}>имя(аргументы)</code> и
              подставляются в правую часть оператора. Ниже — полный список MVP-функций,
              сгруппированных по категориям, с примерами вызова.
            </p>

            <h3 style={h3}>9.1 Пользовательские</h3>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Функция</th>
                  <th style={thStyle}>Возвращает</th>
                  <th style={thStyle}>Пример</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>currentUser()</code>
                  </td>
                  <td style={tdStyle}>User</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'assignee = currentUser()'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>membersOf("group")</code>
                  </td>
                  <td style={tdStyle}>User[]</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'assignee IN membersOf("backend")'}</code>
                  </td>
                </tr>
              </tbody>
            </table>

            <h3 style={h3}>9.2 Даты и время</h3>
            <p style={p}>
              Все функции времени принимают опциональный offset в виде строки:{' '}
              <code style={codeStyle}>"-7d"</code>, <code style={codeStyle}>"1M"</code>,{' '}
              <code style={codeStyle}>"2w"</code>. Единицы: <code style={codeStyle}>d</code>,{' '}
              <code style={codeStyle}>w</code>, <code style={codeStyle}>M</code>,{' '}
              <code style={codeStyle}>y</code>, <code style={codeStyle}>h</code>,{' '}
              <code style={codeStyle}>m</code>.
            </p>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Функция</th>
                  <th style={thStyle}>Возвращает</th>
                  <th style={thStyle}>Пример</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>now()</code>
                  </td>
                  <td style={tdStyle}>DATETIME</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'updated >= now() - 1h'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>today()</code>
                  </td>
                  <td style={tdStyle}>DATE</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'due = today()'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>startOfDay([offset])</code>
                  </td>
                  <td style={tdStyle}>DATETIME</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'created >= startOfDay("-1d")'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>endOfDay([offset])</code>
                  </td>
                  <td style={tdStyle}>DATETIME</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'due <= endOfDay()'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>startOfWeek([offset])</code>
                  </td>
                  <td style={tdStyle}>DATETIME</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'updated >= startOfWeek()'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>endOfWeek([offset])</code>
                  </td>
                  <td style={tdStyle}>DATETIME</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'updated < endOfWeek()'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>startOfMonth([offset])</code>
                  </td>
                  <td style={tdStyle}>DATETIME</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'resolvedAt >= startOfMonth("-1M")'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>endOfMonth([offset])</code>
                  </td>
                  <td style={tdStyle}>DATETIME</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'due <= endOfMonth()'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>startOfYear([offset])</code>
                  </td>
                  <td style={tdStyle}>DATETIME</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'created >= startOfYear()'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>endOfYear([offset])</code>
                  </td>
                  <td style={tdStyle}>DATETIME</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'due <= endOfYear()'}</code>
                  </td>
                </tr>
              </tbody>
            </table>
            <div style={note}>
              <strong>Относительные даты в литерале.</strong>{' '}
              <code style={codeStyle}>due &lt;= "7d"</code> — сокращение для{' '}
              <code style={codeStyle}>due &lt;= now() + 7d</code>. Парсер подставит
              автоматически.
            </div>

            <h3 style={h3}>9.3 Спринты и релизы</h3>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Функция</th>
                  <th style={thStyle}>Возвращает</th>
                  <th style={thStyle}>Пример</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>openSprints()</code>
                  </td>
                  <td style={tdStyle}>Sprint[]</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'sprint IN openSprints()'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>closedSprints()</code>
                  </td>
                  <td style={tdStyle}>Sprint[]</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'sprint IN closedSprints()'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>futureSprints()</code>
                  </td>
                  <td style={tdStyle}>Sprint[]</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'sprint IN futureSprints()'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>unreleasedVersions([project])</code>
                  </td>
                  <td style={tdStyle}>Release[]</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'release IN unreleasedVersions(TTMP)'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>releasedVersions([project])</code>
                  </td>
                  <td style={tdStyle}>Release[]</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'release IN releasedVersions()'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>earliestUnreleasedVersion([project])</code>
                  </td>
                  <td style={tdStyle}>Release</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'release = earliestUnreleasedVersion(TTMP)'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>latestReleasedVersion([project])</code>
                  </td>
                  <td style={tdStyle}>Release</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'release = latestReleasedVersion(TTMP)'}</code>
                  </td>
                </tr>
              </tbody>
            </table>

            <h3 style={h3}>9.4 Связи задач</h3>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Функция</th>
                  <th style={thStyle}>Возвращает</th>
                  <th style={thStyle}>Пример</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>linkedIssues(key[, linkType])</code>
                  </td>
                  <td style={tdStyle}>Issue[]</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'issue IN linkedIssues("TTMP-42", "blocks")'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>subtasksOf(key)</code>
                  </td>
                  <td style={tdStyle}>Issue[]</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'issue IN subtasksOf("TTMP-10")'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>epicIssues(key)</code>
                  </td>
                  <td style={tdStyle}>Issue[]</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'issue IN epicIssues("TTMP-42")'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>myOpenIssues()</code>
                  </td>
                  <td style={tdStyle}>shortcut</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'myOpenIssues()'}</code>
                    <div style={{ color: c.t3, fontSize: 12, marginTop: 4 }}>
                      эквивалент{' '}
                      <code style={codeStyle}>
                        assignee = currentUser() AND statusCategory != DONE
                      </code>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            <h3 style={h3}>9.5 Контрольные точки</h3>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Функция</th>
                  <th style={thStyle}>Возвращает</th>
                  <th style={thStyle}>Пример</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>violatedCheckpoints([typeName])</code>
                  </td>
                  <td style={tdStyle}>Issue[]</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'issue IN violatedCheckpoints()'}</code>
                    <div style={{ color: c.t3, fontSize: 12, marginTop: 4 }}>
                      с фильтром по имени типа:{' '}
                      <code style={codeStyle}>violatedCheckpoints("Go-live")</code>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>violatedCheckpointsOf(releaseKeyOrId[, typeName])</code>
                  </td>
                  <td style={tdStyle}>Issue[]</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'violatedCheckpointsOf("TTMP-5.0")'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>checkpointsAtRisk([typeName])</code>
                  </td>
                  <td style={tdStyle}>Issue[]</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'checkpointsAtRisk()'}</code>
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <code style={codeStyle}>checkpointsInState(state[, typeName])</code>
                  </td>
                  <td style={tdStyle}>Issue[]</td>
                  <td style={tdStyle}>
                    <code style={codeStyle}>{'checkpointsInState(WARNING)'}</code>
                    <div style={{ color: c.t3, fontSize: 12, marginTop: 4 }}>
                      допустимые state:{' '}
                      <code style={codeStyle}>
                        PENDING, ON_TRACK, WARNING, OVERDUE, ERROR, SATISFIED
                      </code>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <p style={p}>
              Для простого сценария «показать задачи с активным нарушением» три формы
              эквивалентны:
            </p>
            <pre style={pre}>{`issue IN violatedCheckpoints()
violatedCheckpoints()                -- парсер оборачивает в "issue IN (…)"
hasCheckpointViolation = true        -- булев-аналог без аргумента`}</pre>
          </section>

          {/* 10. ORDER BY */}
          <section id="order-by">
            <h2 style={h2}>10. Сортировка (ORDER BY)</h2>
            <p style={p}>
              Сортировка задаётся после основного фильтра. Допустимо несколько ключей — через
              запятую; направление — <code style={codeStyle}>ASC</code> (по умолчанию) или{' '}
              <code style={codeStyle}>DESC</code>.
            </p>
            <pre style={pre}>{`project = TTMP AND statusCategory != DONE
ORDER BY priority DESC, updated DESC`}</pre>
            <p style={p}>
              Сортировать можно только <strong>sortable-поля</strong>: все system-поля кроме
              TEXT (<code style={codeStyle}>summary</code>, <code style={codeStyle}>description</code>,{' '}
              <code style={codeStyle}>comment</code>) и те кастомные поля, у которых есть индекс
              в базе.
            </p>
          </section>

          {/* 11. Сохранённые фильтры */}
          <section id="saved-filters">
            <h2 style={h2}>11. Сохранённые фильтры</h2>
            <p style={p}>
              Любой запрос можно сохранить кнопкой <strong>«+ Сохранить»</strong> (или{' '}
              <code style={codeStyle}>Ctrl+S</code>). Для фильтра задаются: имя, видимость (
              <code style={codeStyle}>PRIVATE</code> / <code style={codeStyle}>SHARED</code> /{' '}
              <code style={codeStyle}>PUBLIC</code>), описание, чекбокс «Избранный». При
              <code style={codeStyle}> SHARED</code> выбираются пользователи или группы с
              правами <code style={codeStyle}>READ</code> / <code style={codeStyle}>WRITE</code>.
            </p>
            <p style={p}>
              Прямая ссылка на фильтр:{' '}
              <code style={codeStyle}>/search/saved/&lt;filterId&gt;</code>. Любое текущее
              состояние страницы тоже отражается в URL —{' '}
              <code style={codeStyle}>/search?jql=…&amp;columns=…&amp;page=…</code>, — так что
              ссылку можно копировать в мессенджер, открывать в новой вкладке, добавлять в
              закладки.
            </p>
            <div style={note}>
              <strong>Про PUBLIC и права.</strong> Даже открывая чужой{' '}
              <code style={codeStyle}>PUBLIC</code>-фильтр, пользователь увидит только задачи
              из <strong>своих</strong> доступных проектов. Выйти за пределы собственных прав
              через чужой фильтр нельзя.
            </div>
          </section>

          {/* 12. Примеры */}
          <section id="examples">
            <h2 style={h2}>12. Готовые примеры</h2>

            <h3 style={h3}>12.1 Каждодневные</h3>
            <pre style={pre}>{`# Мои активные задачи
assignee = currentUser() AND statusCategory != DONE
ORDER BY priority DESC, updated DESC

# Срочное на ближайшие 3 дня
priority IN (CRITICAL, HIGH) AND due <= "3d"

# Баги в ревью
type = BUG AND status = REVIEW

# Без исполнителя
assignee IS EMPTY AND statusCategory = TODO`}</pre>

            <h3 style={h3}>12.2 Планирование и отчётность</h3>
            <pre style={pre}>{`# Неназначенные задачи проекта в активных спринтах
project = TTMP AND sprint IN openSprints() AND assignee IS EMPTY

# Переходящие из прошлого спринта
sprint IN closedSprints() AND statusCategory != DONE

# HIGH/CRITICAL без эстимейта
priority IN (CRITICAL, HIGH) AND estimatedHours IS EMPTY

# Эпик TTMP-42 и всё, что в нём
key = "TTMP-42" OR parent = "TTMP-42" OR epic = "TTMP-42"

# Обновлённые на этой неделе
updated >= startOfWeek() AND updated < endOfWeek()`}</pre>

            <h3 style={h3}>12.3 Контрольные точки</h3>
            <pre style={pre}>{`# Мои задачи с активным нарушением КТ
assignee = currentUser() AND hasCheckpointViolation = true

# Нарушения типа «Все назначены»
checkpointViolationType = "Все назначены"

# Нарушения в релизе TTMP-5.0 + задачи «в зоне риска»
violatedCheckpointsOf("TTMP-5.0") OR checkpointsAtRisk()

# Релизы, где любая КТ в WARNING
checkpointsInState(WARNING)`}</pre>

            <h3 style={h3}>12.4 Кастомные поля</h3>
            <pre style={pre}>{`"Story Points" >= 5 AND "Story Points" <= 13
"Design Review Required" = true
"Release Milestone" IN ("Beta", "GA")
"Tech Lead" = currentUser()`}</pre>

            <h3 style={h3}>12.5 Сложные составные</h3>
            <pre style={pre}>{`# OR + вложенные группы + функция связей
(priority = CRITICAL OR labels IN ("hotfix"))
  AND NOT (issue IN linkedIssues("TTMP-42", "blocks") AND statusCategory != DONE)
  AND "Story Points" IS NOT EMPTY

# Межпроектный дайджест за неделю
project IN (TTMP, TTSRH) AND updated >= startOfWeek()
  AND (statusCategory = IN_PROGRESS OR resolvedAt >= startOfWeek())
ORDER BY project ASC, priority DESC`}</pre>
          </section>

          {/* 13. Ограничения */}
          <section id="limits">
            <h2 style={h2}>13. Ограничения</h2>
            <ul style={{ ...p, paddingLeft: 20 }}>
              <li>
                <strong>Страница результата:</strong> до 100 задач (<code style={codeStyle}>limit</code>).
                Для больших выборок — CSV/XLSX-экспорт.
              </li>
              <li>
                <strong>Rate-limit:</strong> 30 запросов в минуту на пользователя. Превышение →
                HTTP 429.
              </li>
              <li>
                <strong>Timeout:</strong> 10&nbsp;сек на выполнение, 2&nbsp;сек на валидацию,
                1&nbsp;сек на автодополнение.
              </li>
              <li>
                <strong>Scope (R3):</strong> результаты всегда отфильтрованы по доступным
                проектам. Чужой <code style={codeStyle}>PUBLIC</code>-фильтр не расширяет права.
              </li>
              <li>
                <strong>Не реализованы в MVP:</strong> <code style={codeStyle}>WAS</code>,{' '}
                <code style={codeStyle}>CHANGED</code> (требуют истории), функции{' '}
                <code style={codeStyle}>watchedIssues()</code>,{' '}
                <code style={codeStyle}>votedIssues()</code>,{' '}
                <code style={codeStyle}>lastLogin()</code>. Парсер примет, валидатор сообщит{' '}
                <em>NotImplemented</em> с позицией.
              </li>
              <li>
                <strong>Полнотекстовый поиск:</strong> сейчас ILIKE (подстрока). Морфология и{' '}
                <code style={codeStyle}>pg_trgm</code> — Phase 2.
              </li>
            </ul>
          </section>

          <div style={{ borderTop: `1px solid ${c.borderSoft}`, marginTop: 36, paddingTop: 14, color: c.t3, fontSize: 12 }}>
            Документ синхронизирован с §5 ТЗ TTSRH-1. Для изменений открывайте задачу в
            TaskTime — справка обновляется вместе с грамматикой.
          </div>
        </main>
      </div>
    </div>
  );
}
