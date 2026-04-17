import type { ReactElement } from 'react';
import type { SystemRoleType } from '../../types';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { hasSystemRole } from '../../lib/roles';

/**
 * Client-side gate for admin-only route elements.
 *
 * Backend middleware already enforces 403 on the protected endpoints, so this is purely a UX
 * hardening: unauthorised URL access redirects to `/` instead of flashing admin UI before the
 * first API call fails.
 *
 * `allow` is an injectable predicate so each feature can bring its own rule. Default is
 * "system ADMIN" to preserve prior behaviour, but features with a distinct access helper
 * (e.g. `canViewUserGroups` in Phase 3, anticipating Phase 4's `USER_GROUP_VIEW` permission)
 * pass their own predicate — no hardcoded ADMIN check bleeds into feature code. AI review
 * #66 round 17 🟠 — abstract, don't hardcode.
 *
 * Applied ONLY to the new /admin/user-groups routes (TTSEC-2 Phase 3). Extending the gate to
 * other /admin/* routes needs an access-matrix audit per page first — some existing admin
 * views may be reachable by RELEASE_MANAGER / AUDITOR system roles and rely on backend 403,
 * not ADMIN-only client-side gating (AI review #66 round 16 🟠).
 */
export default function AdminGate({
  children,
  allow,
}: {
  children: ReactElement;
  allow?: (roles: SystemRoleType[] | null | undefined) => boolean;
}) {
  const user = useAuthStore(s => s.user);
  const predicate = allow ?? ((roles: SystemRoleType[] | null | undefined) => hasSystemRole(roles, 'ADMIN'));
  if (!user) return <Navigate to="/login" replace />;
  if (!predicate(user.systemRoles)) return <Navigate to="/" replace />;
  return children;
}
