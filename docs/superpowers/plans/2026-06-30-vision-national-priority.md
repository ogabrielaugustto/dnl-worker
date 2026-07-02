# Vision National Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify Vision detections as national or international, persist that classification, and tighten similarity thresholds without dropping international results entirely.

**Architecture:** The change stays inside the worker pipeline. Vision remains the sole discovery source, `detection-normalizer` becomes responsible for scope derivation and result prioritization, and `detections` persists the derived scope so downstream surfaces can filter without recomputing.

**Tech Stack:** TypeScript, Node test runner, Supabase SQL migrations, Google Vision Web Detection

---

### Task 1: Add failing normalization tests

**Files:**
- Create: `tests/vision-detection-normalizer.test.ts`
- Modify: `src/modules/vision/detection-normalizer.ts`

- [ ] Write failing tests for national classification, national-first ordering, and stricter weak-match thresholds.
- [ ] Run the focused test file and confirm it fails for the missing behavior.
- [ ] Implement the minimal normalization changes.
- [ ] Re-run the focused test file until it passes.

### Task 2: Add failing repository persistence tests

**Files:**
- Create: `tests/detections.repository.test.ts`
- Modify: `src/modules/detections/detections.repository.ts`
- Modify: `src/modules/shared/types.ts`

- [ ] Write failing tests proving inserts and updates carry `source_scope` and `source_scope_confidence`.
- [ ] Run the focused test file and confirm it fails for the missing fields.
- [ ] Implement the repository and shared type updates.
- [ ] Re-run the focused test file until it passes.

### Task 3: Add schema and config support

**Files:**
- Create: `supabase/migrations/20260630183000_detection_source_scope_and_precision.sql`
- Modify: `src/config/env.ts`
- Modify: `.env.example`
- Modify: `README.md`

- [ ] Add the migration for detection source scope fields.
- [ ] Add stricter Vision threshold env defaults.
- [ ] Update docs and example env values to match the new behavior.

### Task 4: Verify the full worker contract

**Files:**
- Test: `tests/vision-detection-normalizer.test.ts`
- Test: `tests/detections.repository.test.ts`

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
