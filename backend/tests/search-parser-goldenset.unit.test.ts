/**
 * TTSRH-1 PR-2 — golden-set parsing test.
 *
 * Reads docs/tz/TTSRH-1-goldenset.jql (the canonical set of ~50 real queries from
 * §11 ТЗ, extended in §16 with checkpoint queries) and asserts that every one of
 * them parses WITHOUT errors. This is the fail-fast test that blocks any change
 * to the grammar from breaking real-world queries.
 *
 * Queries are separated by blank lines; `--` lines are comments and are skipped.
 * Multi-line queries are supported (continuation lines are joined by newline).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from '../src/modules/search/search.parser.js';

interface GoldenQuery {
  /** Human-readable label like `01` or `51` taken from the preceding comment. */
  label: string;
  source: string;
  /** 1-based line number in the .jql file (for error messages). */
  startLine: number;
}

function loadGoldenSet(): GoldenQuery[] {
  const path = resolve(__dirname, '../../docs/tz/TTSRH-1-goldenset.jql');
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');

  const queries: GoldenQuery[] = [];
  let buf: string[] = [];
  let bufStartLine = 0;
  let lastLabel = '';

  const flush = () => {
    const source = buf.join('\n').trim();
    if (source) {
      queries.push({ label: lastLabel, source, startLine: bufStartLine });
    }
    buf = [];
    bufStartLine = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();

    if (line.startsWith('--')) {
      // Comment line — capture "-- NN" labels, otherwise treat as section divider.
      flush();
      const labelMatch = line.match(/^--\s*(\d{1,3})\b/);
      if (labelMatch) lastLabel = labelMatch[1]!;
      continue;
    }

    if (!line) {
      flush();
      continue;
    }

    if (buf.length === 0) bufStartLine = i + 1;
    buf.push(raw);
  }
  flush();

  return queries;
}

describe('parser — golden-set (docs/tz/TTSRH-1-goldenset.jql)', () => {
  const queries = loadGoldenSet();

  it('loaded at least 50 queries', () => {
    // §11 ТЗ promises ~50; §16 adds checkpoint queries bringing total to ~63.
    expect(queries.length).toBeGreaterThanOrEqual(50);
  });

  it.each(queries.map((q) => [q.label || '?', q.source.replace(/\s+/g, ' '), q] as const))(
    'query #%s: `%s`',
    (_label, _preview, q) => {
      const result = parse(q.source);
      if (result.errors.length > 0) {
        const { code, message, start, end } = result.errors[0]!;
        const snippet = q.source.slice(start, end);
        throw new Error(
          `Golden query #${q.label} (line ${q.startLine}) failed to parse: ` +
            `[${code}] ${message}  at [${start}..${end}]="${snippet}".\n` +
            `Source:\n${q.source}`,
        );
      }
      expect(result.ast).not.toBeNull();
    },
  );
});
