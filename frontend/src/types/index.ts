/**
 * Flow Universe — Types barrel
 * TTUI-125: типы разбиты по доменным модулям.
 * Этот файл реэкспортирует всё для обратной совместимости.
 *
 * Прямые импорты по доменам (рекомендуется для новых файлов):
 *   import type { User } from '../types/auth.types';
 *   import type { Issue } from '../types/issue.types';
 *   import type { Sprint } from '../types/sprint.types';
 *   …и т.д.
 */

export type { UserRole, User, AuthResponse } from './auth.types';

export type {
  IssueType,
  IssueStatus,
  IssuePriority,
  AiExecutionStatus,
  AiAssigneeType,
  IssueTypeConfig,
  IssueTypeSchemeItem,
  IssueTypeSchemeProject,
  IssueTypeScheme,
  KanbanField,
  Issue,
  IssueLinkType,
  IssueLink,
  Comment,
  AuditEntry,
  BoardData,
} from './issue.types';

export type { ProjectCategory, Project } from './project.types';

export type { SprintState, Sprint, SprintDetailsResponse } from './sprint.types';

export type { TeamMember, Team } from './team.types';

export type {
  ReleaseLevel,
  ReleaseState,
  SprintInRelease,
  ReleaseReadiness,
  Release,
} from './release.types';

export type { TimeLog, UserTimeSummary } from './time.types';
