import { create } from 'zustand';
import type { Project } from '../types';
import * as projectsApi from '../api/projects';

interface ProjectsState {
  projects: Project[];
  loading: boolean;
  fetchProjects: () => Promise<void>;
}

export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: [],
  loading: false,

  fetchProjects: async () => {
    set({ loading: true });
    try {
      const projects = await projectsApi.listProjects();
      set({ projects, loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));
