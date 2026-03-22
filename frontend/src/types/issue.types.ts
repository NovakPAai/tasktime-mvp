/** Issue domain types — TTUI-125 */

export type IssueType = 'EPIC' | 'STORY' | 'TASK' | 'SUBTASK' | 'BUG';
export type IssueStatus = 'OPEN' | 'IN_PROGRESS' | 'REVIEW' | 'DONE' | 'CANCELLED';
export type IssuePriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AiExecutionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'FAILED';
export type AiAssigneeType = 'HUMAN' | 'AGENT' | 'MIXED';

export interface IssueTypeConfig {
  id: string;
  name: string;
  description?: string | null;
  iconName: string;
  iconColor: string;
  isSubtask: boolean;
  isEnabled: boolean;
  isSystem: boolean;
  systemKey?: string | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface IssueTypeSchemeItem {
  id: string;
  orderIndex: number;
  typeConfig: IssueTypeConfig;
}

export interface IssueTypeSchemeProject {
  id: string;
  projectId: string;
  project: { id: string; name: string; key: string };
}

export interface IssueTypeScheme {
  id: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  items: IssueTypeSchemeItem[];
  projects: IssueTypeSchemeProject[];
}

export interface KanbanField {
  customFieldId: string;
  name: string;
  fieldType: string;
  value: unknown;
  showOnKanban: boolean;
}

export interface Issue {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description?: string;
  acceptanceCriteria?: string | null;
  type: IssueType | null;
  issueTypeConfigId?: string | null;
  issueTypeConfig?: IssueTypeConfig | null;
  status: IssueStatus;
  priority: IssuePriority;
  aiEligible?: boolean;
  aiExecutionStatus?: AiExecutionStatus;
  aiAssigneeType?: AiAssigneeType;
  parentId?: string;
  assigneeId?: string;
  creatorId: string;
  assignee?: { id: string; name: string; email?: string };
  creator?: { id: string; name: string };
  parent?: { id: string; title: string; type: IssueType; number: number };
  children?: Issue[];
  project?: { id: string; name: string; key: string };
  releaseId?: string | null;
  estimatedHours?: number | null;
  kanbanFields?: KanbanField[];
  _count?: { children: number };
  createdAt: string;
  updatedAt: string;
}

export interface IssueLinkType {
  id: string;
  name: string;
  outboundName: string;
  inboundName: string;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IssueLink {
  id: string;
  createdAt: string;
  linkType: Pick<IssueLinkType, 'id' | 'name' | 'outboundName' | 'inboundName'>;
  sourceIssue: { id: string; number: number; title: string; type: IssueType; status: IssueStatus; issueTypeConfig?: IssueTypeConfig | null; project: { key: string } };
  targetIssue: { id: string; number: number; title: string; type: IssueType; status: IssueStatus; issueTypeConfig?: IssueTypeConfig | null; project: { key: string } };
  createdBy: { id: string; name: string };
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
  user?: { id: string; name: string };
  createdAt: string;
}

export interface Comment {
  id: string;
  issueId: string;
  authorId: string;
  body: string;
  author?: { id: string; name: string; email?: string };
  createdAt: string;
  updatedAt: string;
}

export interface BoardData {
  projectId: string;
  sprintId: string | null;
  columns: Record<IssueStatus, Issue[]>;
}
