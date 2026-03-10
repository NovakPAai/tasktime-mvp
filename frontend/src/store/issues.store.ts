import { create } from 'zustand';
import type { Issue } from '../types';
import * as issuesApi from '../api/issues';

interface IssuesState {
  issues: Issue[];
  loading: boolean;
  fetchIssues: (projectId: string) => Promise<void>;
}

export const useIssuesStore = create<IssuesState>((set) => ({
  issues: [],
  loading: false,

  fetchIssues: async (projectId: string) => {
    set({ loading: true });
    try {
      const issues = await issuesApi.listIssues(projectId);
      set({ issues, loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));
