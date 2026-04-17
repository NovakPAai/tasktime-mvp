import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { hasSystemRole } from '../../lib/roles';

/**
 * Client-side gate for admin-only route elements.
 *
 * Backend middleware already enforces 403 on the protected endpoints, so this is purely a UX
 * hardening: unauthorised URL access redirects to `/` instead of flashing admin UI before the
 * first API call fails. Current project has 26 admin routes registered without a central guard
 * (AI review #66 rounds 5-6 🟠); adopting `<AdminGate>` per route is the incremental migration
 * path — each PR touching an admin route can wrap its own element.
 */
export default function AdminGate({ children }: { children: ReactElement }) {
  const user = useAuthStore(s => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!hasSystemRole(user.systemRoles, 'ADMIN')) return <Navigate to="/" replace />;
  return children;
}
