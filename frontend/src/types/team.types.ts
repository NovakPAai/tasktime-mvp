/** Team domain types — TTUI-125 */
import type { User } from './auth.types';

export interface TeamMember {
  id: string;
  userId: string;
  teamId: string;
  role?: string | null;
  createdAt: string;
  user: User;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  members?: TeamMember[];
  _count?: { members: number };
}
