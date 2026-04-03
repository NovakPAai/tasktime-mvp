# Phase 2 POC Plan — 5 Real PR Testing

**Date:** 2026-03-28
**Goal:** Run CodeRabbit + Qodo on 5 real PR, collect metrics for comparison
**Status:** Starting Phase 2

---

## PR Selection (Risk Profiles)

| # | PR # | Title | Risk | Status |
|---|------|-------|------|--------|
| 1 | #163 | feat(issues): change type and move between projects | MEDIUM | 🔄 Active now |
| 2 | TBD | (Low risk — config/docs change) | LOW | ⏳ Pending |
| 3 | TBD | (Medium risk — new component) | MEDIUM | ⏳ Pending |
| 4 | TBD | (High risk — large refactor) | HIGH | ⏳ Pending |
| 5 | TBD | (Security risk — auth/secrets) | SECURITY | ⏳ Pending |

---

## PR #163 Baseline (Start Here)

**Title:** feat(issues): change type and move between projects
**Author:** St1tcher86
**Created:** 2026-03-28 12:41 UTC
**Type:** MEDIUM (new API endpoints + frontend modal)

**CodeRabbit Status:** ✅ Posted detailed review

### Metrics Collection Template

```markdown
## PR #163 Comparison

### CodeRabbit
- Comments posted: YES
- Issues found: [count from review]
- Severity breakdown: CRITICAL×? HIGH×? MEDIUM×? INFO×?
- False positives: [list or "none"]
- Time to review: ~2 min (observed)
- Quality: [Excellent/Good/Fair/Poor]

### Qodo
- Comments posted: [YES/NO/WAITING]
- Issues found: [count]
- Severity breakdown: CRITICAL×? HIGH×? MEDIUM×? INFO×?
- False positives: [list or "none"]
- Time to review: [minutes]
- Quality: [Excellent/Good/Fair/Poor]

### Manual Review (Human)
- Real issues identified: [list]
- Overlap with CodeRabbit: X%
- Overlap with Qodo: X%
- Issues only CodeRabbit caught: [list or "none"]
- Issues only Qodo caught: [list or "none"]
- Issues both missed: [list or "none"]

### Analysis
- Better agent: CodeRabbit / Qodo / Tie
- Notes: [...]
```

---

## Next Steps

### Immediate (today)
1. ✅ Collect CodeRabbit review from PR #163
2. ⏳ Wait for Qodo to comment on PR #163 (or manually run)
3. ⏳ Fill in comparison metrics

### Soon (tomorrow)
4. Find 4 more PR (low/medium/high/security risk)
5. Repeat process on each

### End of Phase 2
6. Aggregate metrics across all 5 PR
7. Calculate CodeRabbit vs Qodo accuracy/precision/recall
8. **Decision: which agent to keep?**

---

## Decision Criteria (Reminder)

Will evaluate against:
1. ✅ Catches ≥70% CRITICAL issues (security, validation, errors)
2. ✅ Catches ≥50% HIGH issues (immutability, types, patterns)
3. ✅ False positive rate < 20%
4. ✅ Response time < 3 minutes
5. ✅ Team can easily read/understand

**Winner:** First agent to hit ≥4/5 criteria across 5 PR gets integrated into CI/CD

---

## Files & Commands

**Collect CodeRabbit from PR:**
```bash
gh pr view 163 --json comments --jq '.comments[] | select(.author.login == "coderabbitai") | .body'
```

**Check for Qodo:**
```bash
gh pr view 163 --json comments --jq '.comments[] | select(.author.login | contains("qodo")) | .body'
```

**Save comparison:**
```bash
# Will save to /docs/poc-reviews/PR-163-comparison.md
```

---

## Status Tracking

- [x] Phase 1: Baseline (CodeRabbit on PR #164)
- [ ] Phase 2: 5 Real PR (CodeRabbit + Qodo)
  - [ ] PR #163 (MEDIUM)
  - [ ] PR-A (LOW)
  - [ ] PR-B (MEDIUM)
  - [ ] PR-C (HIGH)
  - [ ] PR-D (SECURITY)
- [ ] Phase 3: Decision & Integration
- [ ] Phase 4: CI/CD Setup
- [ ] Phase 5: Team Training

