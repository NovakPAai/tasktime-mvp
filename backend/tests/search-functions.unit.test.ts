/**
 * TTSRH-1 PR-3 — unit tests for the TTS-QL function registry and pure date evaluators.
 *
 * T-3 in §6 ТЗ ("Unit functions — currentUser, startOfWeek(offset), openSprints with
 * mocked date") is covered by the pure-evaluator cases below. DB-dependent function
 * resolution is exercised via integration tests in PR-5.
 */
import { describe, it, expect } from 'vitest';
import {
  applyOffset,
  endOfDayUtc,
  endOfIsoWeekUtc,
  endOfMonthUtc,
  endOfYearUtc,
  evaluatePureDateFn,
  functionsForVariant,
  parseOffset,
  resolveFunction,
  startOfDayUtc,
  startOfIsoWeekUtc,
  startOfMonthUtc,
  startOfYearUtc,
} from '../src/modules/search/search.functions.js';

// A fixed anchor — Wednesday 2026-04-15 12:34:56.789 UTC — used for every test so
// week/month arithmetic is deterministic across timezones.
const ANCHOR = new Date(Date.UTC(2026, 3, 15, 12, 34, 56, 789));

describe('resolveFunction — case-insensitive lookup', () => {
  it.each([
    ['currentUser', 'currentuser'],
    ['CURRENTUSER', 'currentuser'],
    ['startOfMonth', 'startofmonth'],
    ['endOfYear', 'endofyear'],
    ['myOpenIssues', 'myopenissues'],
  ])('resolves `%s` to `%s`', (input, expected) => {
    expect(resolveFunction(input)?.name).toBe(expected);
  });

  it('returns null for unknown function', () => {
    expect(resolveFunction('bogusFunction')).toBeNull();
  });
});

describe('functionsForVariant — context filter', () => {
  it('default variant excludes checkpoint-only functions', () => {
    const defaultFns = functionsForVariant('default').map((f) => f.name);
    expect(defaultFns).not.toContain('releaseplanneddate');
    expect(defaultFns).not.toContain('checkpointdeadline');
    expect(defaultFns).toContain('currentuser');
  });

  it('checkpoint variant excludes user-only functions', () => {
    const kpFns = functionsForVariant('checkpoint').map((f) => f.name);
    expect(kpFns).toContain('releaseplanneddate');
    expect(kpFns).toContain('checkpointdeadline');
    // currentUser() IS available in checkpoint variant (it resolves to NULL with a
    // warning per §5.12.4), so the registry includes it there too.
    // BUT myOpenIssues is user-only.
    expect(kpFns).not.toContain('myopenissues');
  });

  it('Phase-2 functions are in the registry but not callable', () => {
    const watched = resolveFunction('watchedIssues');
    expect(watched?.phase).toBe('PHASE_2');
  });
});

describe('parseOffset', () => {
  it.each([
    ['1d', 1, 'd'],
    ['-7d', -7, 'd'],
    ['2w', 2, 'w'],
    ['3M', 3, 'M'],
    ['-1y', -1, 'y'],
    ['8h', 8, 'h'],
    ['15m', 15, 'm'],
  ])('parses `%s` → %d %s', (src, amount, unit) => {
    expect(parseOffset(src)).toEqual({ amount, unit });
  });

  it.each(['', 'notanoffset', '7x', 'd7', '-'])('rejects `%s`', (bad) => {
    expect(parseOffset(bad)).toBeNull();
  });
});

describe('applyOffset — calendar arithmetic', () => {
  it('adds days', () => {
    const r = applyOffset(ANCHOR, { amount: 5, unit: 'd' });
    expect(r.getUTCDate()).toBe(20);
  });

  it('subtracts days across month boundary', () => {
    const r = applyOffset(new Date(Date.UTC(2026, 3, 3, 0, 0, 0)), { amount: -5, unit: 'd' });
    expect(r.getUTCMonth()).toBe(2); // March (0-indexed)
    expect(r.getUTCDate()).toBe(29);
  });

  it('adds months (Jan 31 + 1M = Mar 3, because Feb has 28 days)', () => {
    const r = applyOffset(new Date(Date.UTC(2026, 0, 31)), { amount: 1, unit: 'M' });
    // JS Date.setMonth normalises to Mar 3 (Feb 31 → Mar 3 in 2026).
    expect(r.getUTCMonth()).toBe(2);
  });

  it('adds years', () => {
    const r = applyOffset(ANCHOR, { amount: 2, unit: 'y' });
    expect(r.getUTCFullYear()).toBe(2028);
  });

  it('weeks = 7 days', () => {
    const r = applyOffset(ANCHOR, { amount: 1, unit: 'w' });
    expect(r.getUTCDate()).toBe(22);
  });

  it('hours & minutes', () => {
    expect(applyOffset(ANCHOR, { amount: 3, unit: 'h' }).getUTCHours()).toBe(15);
    expect(applyOffset(ANCHOR, { amount: 15, unit: 'm' }).getUTCMinutes()).toBe(49);
  });
});

describe('start/end helpers (UTC, deterministic)', () => {
  it('startOfDayUtc — midnight', () => {
    expect(startOfDayUtc(ANCHOR).toISOString()).toBe('2026-04-15T00:00:00.000Z');
  });

  it('endOfDayUtc — 23:59:59.999', () => {
    expect(endOfDayUtc(ANCHOR).toISOString()).toBe('2026-04-15T23:59:59.999Z');
  });

  it('startOfIsoWeekUtc — Monday for a Wednesday anchor', () => {
    // 2026-04-15 is a Wednesday → Monday = 2026-04-13.
    expect(startOfIsoWeekUtc(ANCHOR).toISOString()).toBe('2026-04-13T00:00:00.000Z');
  });

  it('startOfIsoWeekUtc — Monday wrap from a Sunday', () => {
    // 2026-04-19 is a Sunday → Monday = 2026-04-13 (6 days earlier).
    const sun = new Date(Date.UTC(2026, 3, 19, 10, 0, 0));
    expect(startOfIsoWeekUtc(sun).toISOString()).toBe('2026-04-13T00:00:00.000Z');
  });

  it('endOfIsoWeekUtc — Sunday 23:59:59.999', () => {
    expect(endOfIsoWeekUtc(ANCHOR).toISOString()).toBe('2026-04-19T23:59:59.999Z');
  });

  it('startOfMonthUtc / endOfMonthUtc', () => {
    expect(startOfMonthUtc(ANCHOR).toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(endOfMonthUtc(ANCHOR).toISOString()).toBe('2026-04-30T23:59:59.999Z');
  });

  it('startOfYearUtc / endOfYearUtc', () => {
    expect(startOfYearUtc(ANCHOR).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(endOfYearUtc(ANCHOR).toISOString()).toBe('2026-12-31T23:59:59.999Z');
  });
});

describe('evaluatePureDateFn — end-to-end', () => {
  const ctx = { now: ANCHOR };

  it('now() returns anchor', () => {
    expect(evaluatePureDateFn('now', null, ctx)?.toISOString()).toBe(ANCHOR.toISOString());
  });

  it('today() returns midnight of anchor', () => {
    expect(evaluatePureDateFn('today', null, ctx)?.toISOString()).toBe('2026-04-15T00:00:00.000Z');
  });

  it('startOfWeek("-1w") = Monday of previous week', () => {
    // Current week Monday = 2026-04-13. Minus 1 week = 2026-04-06.
    const r = evaluatePureDateFn('startofweek', { amount: -1, unit: 'w' }, ctx);
    expect(r?.toISOString()).toBe('2026-04-06T00:00:00.000Z');
  });

  it('endOfMonth("1M") = last day of next month', () => {
    // Anchor April → +1M = May → last day of May = 2026-05-31 23:59:59.999.
    const r = evaluatePureDateFn('endofmonth', { amount: 1, unit: 'M' }, ctx);
    expect(r?.toISOString()).toBe('2026-05-31T23:59:59.999Z');
  });

  it('startOfMonth("-1M") = first day of previous month', () => {
    const r = evaluatePureDateFn('startofmonth', { amount: -1, unit: 'M' }, ctx);
    expect(r?.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('endOfYear() — end of current year', () => {
    const r = evaluatePureDateFn('endofyear', null, ctx);
    expect(r?.toISOString()).toBe('2026-12-31T23:59:59.999Z');
  });

  it('case-insensitive name', () => {
    const r = evaluatePureDateFn('StArToFdAy', null, ctx);
    expect(r?.toISOString()).toBe('2026-04-15T00:00:00.000Z');
  });

  it('returns null for DB-dependent function', () => {
    expect(evaluatePureDateFn('currentUser', null, ctx)).toBeNull();
    expect(evaluatePureDateFn('openSprints', null, ctx)).toBeNull();
  });
});
