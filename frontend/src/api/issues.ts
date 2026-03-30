import api from './client';
import type {
  Issue,
  IssuePriority,
  IssueStatus,
  AiAssigneeType,
  AiExecutionStatus,
} from '../types';

export interface IssueFilters {
  status?: IssueStatus[];
  issueTypeConfigId?: string[];
  priority?: IssuePriority[];
  assigneeId?: string;
  sprintId?: string;
  from?: string;
  to?: string;
  search?: string;
}

export async function listIssues(projectId: string, filters?: IssueFilters): Promise<Issue[]> {
  const { data } = await api.get<Issue[]>(`/projects/${projectId}/issues`, {
    params: {
      ...(filters?.status && { status: filters.status.join(',') }),
      ...(filters?.issueTypeConfigId && filters.issueTypeConfigId.length > 0 && { issueTypeConfigId: filters.issueTypeConfigId.join(',') }),
      ...(filters?.priority && { priority: filters.priority.join(',') }),
      ...(filters?.assigneeId && { assigneeId: filters.assigneeId }),
      ...(filters?.sprintId && { sprintId: filters.sprintId }),
      ...(filters?.from && { from: filters.from }),
      ...(filters?.to && { to: filters.to }),
      ...(filters?.search && { search: filters.search }),
    },
  });
  return data;
}

export async function listIssuesWithKanbanFields(
  projectId: string,
  sprintId?: string,
): Promise<Issue[]> {
  const { data } = await api.get<Issue[]>(`/projects/${projectId}/issues`, {
    params: { includeKanbanFields: 'true', ...(sprintId ? { sprintId } : {}) },
  });
  return data;
}

export async function getIssue(id: string): Promise<Issue> {
  const { data } = await api.get<Issue>(`/issues/${id}`);
  return data;
}

export async function getIssueByKey(key: string): Promise<Issue> {
  const { data } = await api.get<Issue>(`/issues/key/${encodeURIComponent(key)}`);
  return data;
}

export interface CreateIssueBody {
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  issueTypeConfigId?: string;
  priority?: IssuePriority;
  parentId?: string;
  assigneeId?: string;
  dueDate?: string | null;
}

export async function createIssue(projectId: string, body: CreateIssueBody): Promise<Issue> {
  const { data } = await api.post<Issue>(`/projects/${projectId}/issues`, body);
  return data;
}

export async function updateIssue(id: string, body: Partial<CreateIssueBody & { acceptanceCriteria: string | null }>): Promise<Issue> {
  const { data } = await api.patch<Issue>(`/issues/${id}`, body);
  return data;
}

export async function updateStatus(id: string, status: IssueStatus): Promise<Issue> {
  const { data } = await api.patch<Issue>(`/issues/${id}/status`, { status });
  return data;
}

export async function deleteIssue(id: string): Promise<void> {
  await api.delete(`/issues/${id}`);
}

export async function bulkUpdateIssues(
  projectId: string,
  body: { issueIds: string[]; status?: IssueStatus; assigneeId?: string | null },
): Promise<{ updatedCount: number }> {
  const { data } = await api.post<{ updatedCount: number }>(`/projects/${projectId}/issues/bulk`, body);
  return data;
}

export async function bulkDeleteIssues(
  projectId: string,
  issueIds: string[],
): Promise<{ deletedCount: number }> {
  const { data } = await api.delete<{ deletedCount: number }>(`/projects/${projectId}/issues/bulk`, {
    data: { issueIds },
  });
  return data;
}

export async function assignIssue(id: string, assigneeId: string | null): Promise<Issue> {
  const { data } = await api.patch<Issue>(`/issues/${id}/assign`, { assigneeId });
  return data;
}

export async function updateAiFlags(
  id: string,
  body: { aiEligible?: boolean; aiAssigneeType?: AiAssigneeType },
): Promise<Issue> {
  const { data } = await api.patch<Issue>(`/issues/${id}/ai-flags`, body);
  return data;
}

export async function updateAiStatus(
  id: string,
  aiExecutionStatus: AiExecutionStatus,
): Promise<Issue> {
  const { data } = await api.patch<Issue>(`/issues/${id}/ai-status`, { aiExecutionStatus });
  return data;
}

export interface IssueSearchResult {
  id: string;
  number: number;
  title: string;
  status: IssueStatus;
  project: { key: string };
}

/**
 * Performs a global search for issues that match the provided query string.
 *
 * @param q - The search query to match against issues
 * @param excludeId - Optional issue id to exclude from the results
 * @returns A list of matching issues; if `excludeId` is provided, that issue is omitted from the results
 */
export async function searchIssuesGlobal(q: string, excludeId?: string): Promise<IssueSearchResult[]> {
  const { data } = await api.get<IssueSearchResult[]>('/issues/search', {
    params: { q, ...(excludeId && { excludeId }) },
  });
  return data;
}

export interface HierarchyConflict {
  conflictType: 'PARENT' | 'CHILD';
  issueId: string;
  title: string;
}

/**
 * Change an issue's type to the specified issue type configuration.
 *
 * @param id - The ID of the issue to change
 * @param body - Change parameters
 * @param body.targetIssueTypeConfigId - The target issue type configuration ID to assign to the issue
 * @param body.force - If `true`, force the change even when conflicts exist
 * @returns The updated issue
 */
export async function changeIssueType(
  id: string,
  body: { targetIssueTypeConfigId: string; force?: boolean },
): Promise<Issue> {
  const { data } = await api.patch<Issue>(`/issues/${id}/change-type`, body);
  return data;
}

/**
 * Move an issue to a different project, optionally changing its issue type and moving its children.
 *
 * @param id - The ID of the issue to move
 * @param body - Move options
 * @param body.targetProjectId - ID of the destination project
 * @param body.targetIssueTypeConfigId - Optional target issue type configuration ID to apply after the move
 * @param body.moveChildren - If `true`, also move child issues to the target project
 * @returns The updated issue after the move
 */
export async function moveIssue(
  id: string,
  body: { targetProjectId: string; targetIssueTypeConfigId?: string; moveChildren?: boolean },
): Promise<Issue> {
  const { data } = await api.post<Issue>(`/issues/${id}/move`, body);
  return data;
}

/**
 * Fetches active MVP Livecode issues, optionally filtering by AI eligibility and assignee type.
 *
 * @param params - Optional filters for the request
 * @param params.onlyAiEligible - If provided, include only issues that are eligible for AI when `true`, or include non-eligible when `false`
 * @param params.assigneeType - The assignee type to filter by, or `'ALL'` to include all assignee types
 * @returns An array of active MVP Livecode issues that match the provided filters
 */
export async function listMvpLivecodeActiveIssues(params?: {
  onlyAiEligible?: boolean;
  assigneeType?: AiAssigneeType | 'ALL';
}): Promise<Issue[]> {
  const { data } = await api.get<Issue[]>('/mvp-livecode/issues/active', {
    params: {
      ...(params?.onlyAiEligible !== undefined && { onlyAiEligible: params.onlyAiEligible }),
      ...(params?.assigneeType && { assigneeType: params.assigneeType }),
    },
  });
  return data;
}
