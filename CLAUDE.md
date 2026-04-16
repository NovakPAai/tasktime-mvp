# lean-ctx — Context Engineering Layer

PREFER lean-ctx MCP tools over native equivalents for token savings:

| PREFER | OVER | Why |
|--------|------|-----|
| `ctx_read(path)` | Read / cat / head / tail | Session caching, 8 compression modes, re-reads cost ~13 tokens |
| `ctx_shell(command)` | Bash (shell commands) | Pattern-based compression for git, npm, cargo, docker, tsc |
| `ctx_search(pattern, path)` | Grep / rg | Compact context, token-efficient results |
| `ctx_tree(path, depth)` | ls / find | Compact directory maps with file counts |

## ctx_read Modes

- `full` — cached read (use for files you will edit)
- `map` — deps + API signatures (use for context-only files)
- `signatures` — API surface only
- `diff` — changed lines only (after edits)
- `aggressive` — syntax stripped
- `entropy` — Shannon + Jaccard filtering
- `lines:N-M` — specific range

## File Editing

Use native Edit/StrReplace when available. If Edit requires Read and Read is unavailable,
use `ctx_edit(path, old_string, new_string)` — it reads, replaces, and writes in one MCP call.
NEVER loop trying to make Edit work. If it fails, switch to ctx_edit immediately.
Write, Delete have no lean-ctx equivalent — use them normally.

# UI — Modal/Drawer close must refresh parent page

Whenever you add or modify a modal/drawer (Ant Design `Modal`, `Drawer`, or any custom
overlay), both `onCancel` and `onClose` handlers MUST trigger a refresh of the data on
the page from which the modal/drawer was opened. Closing via the × button, Esc key,
backdrop click, or a "Cancel" footer button must all call the parent's data-loading
function (`load()`, `fetchX()`, `loadX(page)`, etc.).

Rationale: the modal may have side effects (nested actions, auto-save, cascading
updates) that change server state even when the user "cancels". Forcing a refresh
keeps the page consistent with the server without requiring manual F5.

Pattern:

```tsx
// BAD
<Modal onCancel={() => setOpen(false)} ... />

// GOOD
<Modal onCancel={() => { setOpen(false); void load(); }} ... />
```

Applies equally to custom footer "Отмена" buttons inside a Modal/Drawer form.
If the load function is defined inside a `useEffect` closure, extract it as a
top-level `useCallback` so it can be invoked from close handlers.
