import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { LlmProvider, EstimateResult, DecomposeResult } from './llm-provider.interface.js';
import { HeuristicProvider } from './heuristic.provider.js';

const estimateSchema = z.object({
  hours: z.number().min(0.5).max(40),
  reasoning: z.string(),
});

const decomposeSchema = z.object({
  subtasks: z.array(z.string()).min(1),
});

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 512;

function extractJson(raw: string): string {
  // Strip markdown code blocks: ```json ... ``` or ``` ... ```
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) return match[1].trim();
  return raw.trim();
}

export class AnthropicProvider implements LlmProvider {
  private client: Anthropic;
  private fallback = new HeuristicProvider();

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async estimateIssue(title: string, description: string | null): Promise<EstimateResult> {
    const prompt = [
      `Estimate development effort in hours for this software task.`,
      `Title: ${title}`,
      description ? `Description: ${description}` : '',
      ``,
      `Reply with valid JSON only: {"hours": <number 0.5-40>, "reasoning": "<one sentence>"}`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const msg = await this.client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: 'You are a senior software engineer estimating task complexity. Reply only with valid JSON.',
        messages: [{ role: 'user', content: prompt }],
      });

      const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
      const json = JSON.parse(extractJson(text));
      return estimateSchema.parse(json);
    } catch (err) {
      console.warn('[AnthropicProvider] estimateIssue failed, falling back to heuristic:', (err as Error).message);
      return this.fallback.estimateIssue(title, description);
    }
  }

  async decomposeIssue(
    title: string,
    description: string | null,
    type: string,
  ): Promise<DecomposeResult> {
    const descSection = description?.trim() ? `\nОписание:\n${description.trim()}` : '';
    const prompt = [
      `Ты — опытный проджект-менеджер. Декомпозируй задачу типа ${type} на конкретные подзадачи.`,
      ``,
      `Задача: ${title}${descSection}`,
      ``,
      `Требования:`,
      `- Верни от 3 до 8 подзадач`,
      `- Каждая подзадача — конкретный, самостоятельный блок работы`,
      `- Группируй по смыслу: анализ → проектирование → реализация → тестирование`,
      `- Не дроби текст механически — думай о сути работы`,
      `- Заголовок каждой подзадачи до 120 символов`,
      `- Ответ — ТОЛЬКО JSON: {"subtasks": ["...", "..."]}`,
    ].join('\n');

    try {
      const msg = await this.client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: 'Ты — старший разработчик и PM. Отвечай только валидным JSON.',
        messages: [{ role: 'user', content: prompt }],
      });

      const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
      const json = JSON.parse(extractJson(text));
      return decomposeSchema.parse(json);
    } catch (err) {
      console.warn('[AnthropicProvider] decomposeIssue failed, falling back to heuristic:', (err as Error).message);
      return this.fallback.decomposeIssue(title, description, type);
    }
  }
}
