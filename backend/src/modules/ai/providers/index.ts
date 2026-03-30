import type { LlmProvider } from './llm-provider.interface.js';
import { HeuristicProvider } from './heuristic.provider.js';
import { AnthropicProvider } from './anthropic.provider.js';

export type { LlmProvider, EstimateResult, DecomposeResult } from './llm-provider.interface.js';

let _provider: LlmProvider | null = null;

export function getLlmProvider(): LlmProvider {
  if (_provider) return _provider;

  const providerName = process.env.AI_PROVIDER ?? 'heuristic';

  if (providerName === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('[AI] AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set — falling back to heuristic');
      _provider = new HeuristicProvider();
    } else {
      _provider = new AnthropicProvider();
    }
  } else {
    _provider = new HeuristicProvider();
  }

  console.log(`[AI] Provider: ${_provider.constructor.name}`);
  return _provider;
}
