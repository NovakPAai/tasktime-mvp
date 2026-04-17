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
 * Applied once as the parent element of the /admin/* nested route segment in App.tsx, so every
 * admin route — existing and future — passes through this single guard. No need to wrap new
 * pages inline (AI review #66 rounds 5-15 🟠 — consolidated in round 15).
 */
export default function AdminGate({ children }: { children: ReactElement }) {
  const user = useAuthStore(s => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!hasSystemRole(user.systemRoles, 'ADMIN')) return <Navigate to="/" replace />;
  return children;
}
