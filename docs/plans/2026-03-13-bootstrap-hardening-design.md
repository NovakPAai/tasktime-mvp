# Bootstrap Hardening Design

## Goal

Reduce the risk of predictable privileged access when sharing the repository, while keeping local demo and intentional environment bootstrap flows usable.

## Decisions

- Keep built-in bootstrap users generic and remove the hardcoded personal admin account from the repository.
- Allow a personal admin account only through the optional `BOOTSTRAP_OWNER_ADMIN_EMAIL` environment variable.
- Require explicit opt-in with `BOOTSTRAP_ENABLED=true` before running the bootstrap entrypoint.
- Keep `seed` as a local demo/dev tool with its existing behavior so day-to-day development does not break.
- Make deploy scripts skip bootstrap by default unless the backend env explicitly enables it.

## Expected Result

- Production and staging do not create predictable built-in users during deploy unless an operator enables bootstrap on purpose.
- Pavel can still log in under his own account on chosen environments through server-side env configuration, without exposing that email in the repository.
