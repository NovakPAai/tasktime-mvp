import { create } from 'zustand';
import type { Issue, IssueStatus, IssuePriority } from '../types';
import * as issuesApi from '../api/issues';

const PAGE_SIZE = 50;

interface IssuesFilters {
  status: IssueStatus[];
  issueTypeConfigId: string[];
  priority: IssuePriority[];
  assigneeId?: string;
  search?: string;
}

interface IssuesState {
  issues: Issue[];
  loading: boolean;
  error: string | null;
  total: number;
  currentPage: number;
  pageSize: number;
  currentProjectId: string | null;
  filters: IssuesFilters;
  setFilters: (filters: Partial<IssuesFilters>) => void;
  resetFilters: () => void;
  fetchIssues: (projectId: string, page?: number) => Promise<void>;
}

const initialFilters: IssuesFilters = {
  status: [],
  issueTypeConfigId: [],
  priority: [],
};

let fetchSeq = 0;

export const useIssuesStore = create<IssuesState>((set, get) => ({
  issues: [],
  loading: false,
  error: null,
  total: 0,
  currentPage: 1,
  pageSize: PAGE_SIZE,
  currentProjectId: null,
  filters: initialFilters,

  setFilters: (partial) => {
    set((state) => ({ filters: { ...state.filters, ...partial } }));
  },

  resetFilters: () => {
    set({ filters: initialFilters });
  },

  fetchIssues: async (projectId: string, page = 1) => {
    const seq = ++fetchSeq;
    const { currentProjectId } = get();
    if (currentProjectId !== projectId) {
      set({ issues: [], total: 0, currentPage: 1, currentProjectId: projectId });
    }
    set({ loading: true, error: null });
    try {
      const { filters, pageSize } = get();
      const result = await issuesApi.listIssues(
        projectId,
        {
          status: filters.status,
          issueTypeConfigId: filters.issueTypeConfigId,
          priority: filters.priority,
          assigneeId: filters.assigneeId,
          search: filters.search,
        },
        { page, limit: pageSize },
      );
      if (seq !== fetchSeq) return;
      set({ issues: result.data, total: result.meta.total, currentPage: page, loading: false });
    } catch {
      if (seq !== fetchSeq) return;
      set({ loading: false, error: 'Не удалось загрузить задачи проекта' });
    }
  },
}));
