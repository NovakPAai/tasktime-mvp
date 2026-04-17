import type { ReactElement } from 'react';
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
 * Currently applied ONLY to the new /admin/user-groups routes (TTSEC-2 Phase 3). Extending the
 * gate to other /admin/* routes needs an access-matrix audit per page first — some existing
 * admin views may be reachable by RELEASE_MANAGER / AUDITOR system roles and rely on backend
 * 403, not ADMIN-only client-side gating (AI review #66 round 16 🟠 — consolidation rolled back).
 */
export default function AdminGate({ children }: { children: ReactElement }) {
  const user = useAuthStore(s => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!hasSystemRole(user.systemRoles, 'ADMIN')) return <Navigate to="/" replace />;
  return children;
}
