---
description: Classify task type and run the matching command pipeline
---

# /route — Task Router

Classify `$ARGUMENTS` and execute the correct pipeline.

## Instructions

1. **Read** the task: `$ARGUMENTS`

2. **Classify** into one of: `feat` | `fix` | `refactor` | `api` | `ui` | `migration` | `test` | `chore`

3. **Print** the routing decision:
```
─────────────────────────────────
Task:     <task in one line>
Type:     <type>
Pipeline: <step1> → <step2> → ...
─────────────────────────────────
```

4. **Ask for confirmation**: "Proceed with this pipeline? (y/n)"

5. **Execute** each step sequentially. After each step print:
```
✓ <step> complete
```

## Pipelines

**feat** → planner agent → tdd-guide agent → /verify → code-reviewer agent
**fix** → diagnose → fix → /verify → code-reviewer agent
**refactor** → /refactor-clean → refactor → /verify → code-reviewer agent
**api** → planner agent → tdd-guide agent → security-reviewer agent → /verify → code-reviewer agent
**ui** → implement → /verify → code-reviewer agent
**migration** → safety check (confirm if breaking) → /verify
**test** → /test-coverage → write tests → /verify
**chore** → implement → /verify

## Arguments

`$ARGUMENTS` — task description in any language, e.g.:
- `/route добавить экспорт задач в CSV`
- `/route fix: таймер не останавливается при смене проекта`
- `/route TTUI-94: компонент StatusBadge`
