---
created: 2026-03-13T19:08:00.046Z
title: Add user password change flow
area: auth
files:
  - frontend
  - backend/src/modules/auth
  - backend/src/modules/users
---

## Problem

The application currently has no user-facing password change flow after login. During production rollout, the owner account password had to be rotated through an administrative one-off script inside the backend container. This is acceptable for emergency access recovery, but it is not sufficient for normal operation because users cannot replace temporary passwords themselves from the UI.

## Solution

Add a proper authenticated password change feature for logged-in users. Include a backend endpoint that verifies the current password before saving a new hash, invalidates existing refresh tokens/sessions after change, and a frontend settings/profile screen or modal where the user can submit the change. Keep the current one-off admin rotation script for break-glass scenarios, but do not rely on it as the primary path.
