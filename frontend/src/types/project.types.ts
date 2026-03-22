/** Project domain types — TTUI-125 */

export interface ProjectCategory {
  id: string;
  name: string;
  description?: string | null;
  projects?: { id: string; name: string; key: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  key: string;
  description?: string;
  ownerId?: string | null;
  categoryId?: string | null;
  owner?: { id: string; name: string; email: string } | null;
  category?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  _count?: { issues: number };
}
