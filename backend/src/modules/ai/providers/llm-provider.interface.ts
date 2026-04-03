export interface EstimateResult {
  hours: number;
  reasoning: string;
}

export interface DecomposeResult {
  subtasks: string[];
}

export interface LlmProvider {
  estimateIssue(title: string, description: string | null): Promise<EstimateResult>;
  decomposeIssue(title: string, description: string | null, type: string): Promise<DecomposeResult>;
}
