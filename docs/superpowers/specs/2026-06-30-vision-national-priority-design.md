# Vision National Priority Design

## Goal

Refine Google Vision candidate normalization so the worker still stores every valid match, but classifies each detection as `national` or `international`, prioritizes Brazilian/PT-BR sources, and raises similarity precision to reduce unrelated results.

## Design

- Keep Google Vision Web Detection as the only discovery source.
- Enrich normalized candidates with derived geographic scope metadata based on URL and page-language signals.
- Persist the derived scope on `detections` so downstream filtering can happen without recalculation.
- Raise the default minimum similarity threshold from `0.75` to `0.90`.
- Add stricter thresholds for weaker match types:
  - `full`: keep accepted when above the global threshold.
  - `partial`: require a higher threshold than the global baseline.
  - `page`: require the highest threshold because page-only hits are noisier.
- Sort normalized candidates so national results are processed first while still keeping international results.

## Scope Signals

National signals:

- `.br` domains
- well-known Brazilian suffixes like `com.br`, `gov.br`, `jus.br`
- path, query, or title hints for `pt-br`, `pt_br`, or `pt-brasil`
- `lang=pt-BR` / `locale=pt_BR` style URL hints

If no national signal is present, the detection is persisted as `international`.

## Persistence

- Add `source_scope` to `public.detections`
- Add `source_scope_confidence` to `public.detections`
- Keep the detailed derived signals inside `vision_payload`

## Verification

- Add tests for candidate classification, ordering, and threshold tightening.
- Add tests for detection upsert persistence of the new fields.
- Run `npm test`, `npm run typecheck`, and `npm run build`.
