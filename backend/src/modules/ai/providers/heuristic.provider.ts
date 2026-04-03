import type { LlmProvider, EstimateResult, DecomposeResult } from './llm-provider.interface.js';

const MIN_HOURS = 0.5;
const MAX_HOURS = 40;
const BASE_HOURS = 1;
const HOURS_PER_1000_CHARS = 0.5;

export class HeuristicProvider implements LlmProvider {
  async estimateIssue(title: string, description: string | null): Promise<EstimateResult> {
    const text = `${title}\n${description ?? ''}`.trim();
    const extra = (text.length / 1000) * HOURS_PER_1000_CHARS;
    const raw = BASE_HOURS + extra;
    const hours = Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.round(raw * 2) / 2));
    return {
      hours,
      reasoning: `Heuristic estimate based on text length (${text.length} chars).`,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async decomposeIssue(_title: string, description: string | null, _issueType: string): Promise<DecomposeResult> {
    if (!description?.trim()) return { subtasks: ['Уточнить требования'] };
    const subtasks: string[] = [];
    for (const raw of description.split(/\r?\n/)) {
      const line = raw.trim();
      // Only extract explicit bullet/numbered list items — never take every plain line
      const m = line.match(/^[-*•]\s+(.+)/) ?? line.match(/^\d+[.)]\s+(.+)/);
      if (m) subtasks.push(m[1].trim());
      if (subtasks.length >= 10) break;
    }
    return { subtasks: subtasks.length > 0 ? subtasks : ['Уточнить требования'] };
  }
}
