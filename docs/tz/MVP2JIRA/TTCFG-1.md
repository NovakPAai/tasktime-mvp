# ТЗ: TTCFG-1 — Time Tracking (parser + settings + auto-stop)

**Дата:** 2026-04-23
**Тип:** TASK | **Приоритет:** P2 | **Статус:** OPEN
**Проект:** TaskTime MVP (TTMP)
**Исполнитель:** TBD
**Автор ТЗ:** Claude Code (auto-generated)

---

## 1. Постановка задачи

Три небольших улучшения системы учёта времени:

1. **Парсер Jira-style строк** `1w 2d 3h 30m` для ввода/отображения `estimatedHours` и `timeLog.hours`. В БД остаётся `Decimal` часов.
2. **Системные настройки:** `workingHoursPerDay`, `workingDaysPerWeek`, `workingWeekStart`, `defaultEstimateUnit`, `showTimeTrackingInKanban`. Глобальные в `SystemSetting`.
3. **Auto-stop таймера:** если `TimeLog.startedAt` активен более N часов (default 24ч) — авто-stop с установкой `stoppedAt = startedAt + Nhours`, запись «автозакрыто».

### Пользовательские сценарии

**Dev логирует время:**
1. В поле estimatedHours вводит `2d 4h` → парсер (на 8-часовой день) → `20h`.
2. В UI показывается `2d 4h`, а не `20`.

**Пользователь забыл таймер:**
1. Запустил в пятницу 18:00, ушёл в отпуск.
2. В понедельник 18:00 таймер не работает уже 3+ суток, но при auto-stop останавливается ровно на 24 часа работы.
3. Запись в TimeLog `hours=24, note: "[auto-stopped] Timer exceeded 24h"`.

**Админ настраивает:**
1. `/admin/time-tracking` → ставит `workingHoursPerDay=6` (для сокращённой недели).
2. Парсер теперь: `1d = 6h`, `1w = 5×6 = 30h`.

---

## 2. Текущее состояние

- `Issue.estimatedHours: Decimal` — просто число часов.
- `TimeLog.hours: Decimal`, `startedAt/stoppedAt: DateTime?`.
- Парсера времени нет — пользователь вводит только числа.
- Настроек часов/дня нет.
- Auto-stop нет — таймеры висят вечно.

---

## 3. Зависимости

### Модули backend
- [ ] `shared/time-parser/` — новый: parse/format для Jira-style строк.
- [ ] `modules/time/time.service.ts` — интеграция auto-stop cron.
- [ ] `modules/admin/time-tracking-settings.router.ts` — settings.
- [ ] `shared/scheduler/auto-stop.cron.ts` — cron (раз в 5 мин).

### Frontend
- [ ] `components/time/TimeInput.tsx` — input с auto-parse на blur.
- [ ] `pages/admin/AdminTimeTrackingPage.tsx` — settings.
- [ ] Все места ввода/отображения времени (IssueForm, TimeLog, Kanban) — используют парсер.

### Модели данных (Prisma)
- [ ] `SystemSetting` ключи: `time_tracking.*` (JSON).
- [ ] Никаких новых таблиц.

### Внешние зависимости
- Нет (парсер — свой маленький код).

### Блокеры
- Нет.

---

## 4. Риски

| # | Риск | Вероятность | Влияние | Митигация |
|---|------|-------------|---------|-----------|
| 1 | Пользователь вводит `1.5h 30m` (неоднозначно) | Средняя | UX confusion | Парсер игнорирует дробные части внутри компонента (только `1h 30m` или `1.5h`, не оба) |
| 2 | Auto-stop срабатывает на обычно-длинный таск (кодер реально работал 24 часа) | Низкая | Fake data | Notification пользователю за 2 часа до auto-stop + возможность продлить через UI |
| 3 | Изменение workingHoursPerDay задним числом ломает отображение прошлых estimates | Средняя | Разный рендер | Парсер работает только при НОВОМ вводе; прошлые значения в БД — просто числа, отображаются текущим setting'ом |
| 4 | Auto-stop cron пропускает timer из-за downtime | Низкая | Огромный неправильный log | При старте сервиса — проверка «таймеров, которые должны были остановиться», исправление |

---

## 5. Особенности реализации

### 5.1 Парсер (shared/time-parser/)

```typescript
// shared/time-parser/parse.ts
export interface TimeTrackingSettings {
  workingHoursPerDay: number;    // 8
  workingDaysPerWeek: number;    // 5
}

const RX = /(\d+(?:\.\d+)?)\s*([wdhm])/gi;

export function parseTimeString(
  s: string,
  settings: TimeTrackingSettings,
): number {
  // Если пришло просто число — трактуем как часы
  const maybeNum = parseFloat(s);
  if (!isNaN(maybeNum) && !/[a-z]/i.test(s)) return maybeNum;

  let hours = 0;
  for (const match of s.matchAll(RX)) {
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    switch (unit) {
      case 'w': hours += value * settings.workingDaysPerWeek * settings.workingHoursPerDay; break;
      case 'd': hours += value * settings.workingHoursPerDay; break;
      case 'h': hours += value; break;
      case 'm': hours += value / 60; break;
    }
  }
  return Math.round(hours * 100) / 100;  // 2 decimals
}

export function formatHours(
  hours: number,
  settings: TimeTrackingSettings,
): string {
  // 20 → "2d 4h" при 8-hour-day
  if (hours === 0) return '0h';
  const perDay = settings.workingHoursPerDay;
  const perWeek = perDay * settings.workingDaysPerWeek;

  let remaining = hours;
  const weeks = Math.floor(remaining / perWeek); remaining -= weeks * perWeek;
  const days = Math.floor(remaining / perDay); remaining -= days * perDay;
  const wholeH = Math.floor(remaining); remaining -= wholeH;
  const minutes = Math.round(remaining * 60);

  const parts = [];
  if (weeks) parts.push(`${weeks}w`);
  if (days) parts.push(`${days}d`);
  if (wholeH) parts.push(`${wholeH}h`);
  if (minutes) parts.push(`${minutes}m`);
  return parts.join(' ') || '0h';
}
```

### 5.2 Settings

```
Key: time_tracking
Value: JSON
{
  "workingHoursPerDay": 8,
  "workingDaysPerWeek": 5,
  "workingWeekStart": "MONDAY",          // "MONDAY" | "SUNDAY"
  "defaultEstimateUnit": "h",            // для UI-hint
  "showTimeTrackingInKanban": false,
  "autoStopAfterHours": 24
}
```

API:
- `GET /admin/time-tracking` — все.
- `PATCH /admin/time-tracking` — обновить.

Валидация:
- `workingHoursPerDay`: 1–24.
- `workingDaysPerWeek`: 1–7.
- `autoStopAfterHours`: 1–168 (неделя).

### 5.3 Auto-stop cron

```typescript
// shared/scheduler/auto-stop.cron.ts — запускается раз в 5 мин
async function autoStopLongRunningTimers() {
  const settings = await getTimeTrackingSettings();
  const cutoff = new Date(Date.now() - settings.autoStopAfterHours * 3600 * 1000);

  const longRunning = await prisma.timeLog.findMany({
    where: {
      startedAt: { lt: cutoff },
      stoppedAt: null,
    },
  });

  for (const tl of longRunning) {
    const newStoppedAt = new Date(tl.startedAt!.getTime() + settings.autoStopAfterHours * 3600 * 1000);
    const hours = settings.autoStopAfterHours;
    await prisma.timeLog.update({
      where: { id: tl.id },
      data: {
        stoppedAt: newStoppedAt,
        hours,
        note: (tl.note ?? '') + ` [auto-stopped: таймер превысил ${hours}ч]`,
      },
    });
    // audit
    await writeAuditLog(null, 'TimeLog', tl.id, 'auto_stopped', { originalStartedAt: tl.startedAt });
    // notification (TTNOTIF-1) — через publishInTx
    await publishInTx(prisma, 'tt.notifications', 'TIMER_AUTO_STOPPED', {
      userId: tl.userId,
      timeLogId: tl.id,
      hours,
    }, { userId: null });
  }
}
```

### 5.4 2-часовое предупреждение

Опциональный warning cron (каждые 30 мин):
- Найти running-timers с `startedAt < now - (autoStopAfterHours - 2) * 3600`.
- Для каждого — publish `TIMER_WARNING_2H_BEFORE_STOP` (если ранее не отправлено для того же timer'а — через Redis-dedup `warn:timerId` TTL 2 часа).

TTNOTIF-1 → user получает bell-уведомление «Таймер будет остановлен через ~2 часа».

### 5.5 Frontend TimeInput

```tsx
// components/time/TimeInput.tsx
function TimeInput({ value, onChange }: { value: number; onChange: (h: number) => void }) {
  const settings = useTimeTrackingSettings();
  const [text, setText] = useState(formatHours(value, settings));

  const handleBlur = () => {
    try {
      const h = parseTimeString(text, settings);
      onChange(h);
      setText(formatHours(h, settings));  // normalize display
    } catch {
      // keep raw, pass-through для validation error
    }
  };

  return <Input value={text} onChange={(e) => setText(e.target.value)} onBlur={handleBlur} />;
}
```

### 5.6 Admin UI

Страница `/admin/time-tracking`:
- Форма со всеми 6 полями.
- Preview-блок: «Для пользователя ввод `1w 2d 3h` будет означать = X часов».
- Кнопка «Сохранить».

---

## 6. Требования к реализации

### Функциональные
- [ ] FR-1: Parser `parseTimeString('1w 2d 3h')` работает согласно settings.
- [ ] FR-2: Formatter `formatHours(20)` → `"2d 4h"` при 8h/day.
- [ ] FR-3: `SystemSetting` ключ `time_tracking` с 6 полями.
- [ ] FR-4: API `/admin/time-tracking` get/patch.
- [ ] FR-5: Admin-UI страница.
- [ ] FR-6: TimeInput component заменяет InputNumber везде.
- [ ] FR-7: Auto-stop cron работает, TimeLog закрывается со стабильным `stoppedAt`.
- [ ] FR-8: 2h-before warning публикуется в TTNOTIF-1 pipeline.

### Нефункциональные
- [ ] NFR-1: Parser < 1ms.
- [ ] NFR-2: Cron на 10k running-timers < 5 сек.

### Безопасность
- [ ] SEC-1: Settings — SUPER_ADMIN only.

### Тестирование
- [ ] Unit: parser для edge-cases (`0`, `1w 2w` — последний wins или сумма? — sum).
- [ ] Unit: formatter symmetric: `format(parse(x)) === normalize(x)`.
- [ ] Integration: auto-stop cron на фикстуре.
- [ ] E2E: input `2d 4h` → submit → display `2d 4h`.
- [ ] Покрытие ≥ 70%.

---

## 7. Критерии приёмки

- [ ] AC-1: Parser корректно разбирает `1w 2d 3h 30m`.
- [ ] AC-2: Formatter `20h` → `2d 4h` при 8/day.
- [ ] AC-3: Settings сохраняются, применяются глобально.
- [ ] AC-4: Auto-stop работает.
- [ ] AC-5: 2h-warning bell приходит.
- [ ] AC-6: TimeInput используется во всех issue/timelog формах.
- [ ] AC-7: Tests зелёные.

---

## 8. Оценка трудоёмкости

| Этап | Часы |
|------|------|
| Parser/formatter + unit-tests | 4 |
| Settings API + UI | 4 |
| Auto-stop cron + warning cron | 4 |
| TimeInput component + замена в 4 местах | 5 |
| Tests (unit + integration) | 4 |
| Code review | 2 |
| **Итого** | **23** (~0.5 спринта) |

---

## 9. Связанные задачи

- **Зависит от:** нет (TTNOTIF-1 желателен для warning-уведомлений, иначе skip).
- **Связано:** TTUI-75 (общие UI настройки).

---

## 10. Иерархия задач

```
TTCFG-1 (TASK) — Time Tracking
  ├─ TTCFG-1.1 — Parser + formatter
  ├─ TTCFG-1.2 — Settings API + UI
  ├─ TTCFG-1.3 — Auto-stop + warning crons
  ├─ TTCFG-1.4 — TimeInput + integration
  └─ TTCFG-1.5 — Tests
```
