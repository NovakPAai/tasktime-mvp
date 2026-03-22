/** Time tracking domain types — TTUI-125 */

export interface TimeLog {
  id: string;
  issueId: string;
  userId?: string | null;
  hours: number;
  note?: string;
  startedAt?: string;
  stoppedAt?: string;
  logDate: string;
  createdAt: string;
  user?: { id: string; name: string };
  issue?: { id: string; title: string; number: number; project?: { key: string } };
  source?: 'HUMAN' | 'AGENT';
  agentSessionId?: string | null;
  costMoney?: number | null;
  agentSession?: { model: string; provider: string };
}

export interface UserTimeSummary {
  userId: string;
  humanHours: number;
  agentHours: number;
  totalHours: number;
  agentCost: number;
}
