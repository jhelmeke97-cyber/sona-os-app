# P0 Data Flow Architecture & Verification Map (Welle 4G-2)

**Audit Date:** 2026-10-12

---

## Technical Data Flow Pipeline

```
[Ebene 2 · Verbrauch]
  │
  ├─ Raw POS / Invoice Inputs (Article-level consumption & waste/Schwund)
  └─ Aggregation by Category & Standort
        │
        ▼
[Ebene 3 · Controlling]
  │
  ├─ Parent Page ID: 3f4203d6-c726-8045-aa2a-d3fc664d7df5 (04 · Controlling & Periodenvergleich)
  ├─ Spreadsheet: Periodenvergleich Controlling 2026 (1QDVsqbIbiGIrpcaj8YX904Az35p9Aw8MSNQMU2gAmxs)
  ├─ Tab: '2026 In House' (Standort 001 · Karli)
  ├─ Row 2: Header
  ├─ Rows 3-14: Monthly KPI Data Records (2026-01 to 2026-12)
  │    ├─ Col A: Periode
  │    ├─ Col B: Netto-Umsatz (Source of Truth)
  │    ├─ Col C: WE Total (Source of Truth)
  │    ├─ Col D: Deckungsbeitrag (Source of Truth: Netto-Umsatz - WE Total)
  │    ├─ Col E: Cover
  │    ├─ Col F: Umsatz pro Gast
  │    ├─ Col G: WE pro Gast
  │    └─ Col H: WE-Quote
  └─ Row 15: Summary Row (STRICTLY EXCLUDED)
        │
        ▼ [Read-Only Processing]
[03_controlling / PeriodenKpiExporter.gs]
  │
  ├─ readP0PeriodRows_(): Reads rows 3-14, filters row 15, validates headers
  ├─ buildP0KpiRecord_(): Standardizes money to 2 decimals, quotes to 4 decimals
  │                       Derives deckungsbeitrags_quote = D / B
  └─ validateP0KpiRecord_(): Enforces required fields, non-negative bounds, plausibility checks
        │
        ▼ [Sync Pipeline]
[06_notion / NotionPeriodenKpiSync.gs]
  │
  ├─ evaluateWeQuoteAmpel(): Resolves target corridor (Sheet tab KPI_ZIELKORRIDORE)
  ├─ computeKpiRecordHash_(): Generates SHA/hash of canonical payload
  └─ syncPeriodenKpiRecords(): Upserts into Notion DB 10
        │
        ▼
[Notion DB 10 · Perioden-KPI]
  │
  ├─ Database ID: 3f4203d6-c726-81f0-ac8f-e7b664bc92c3
  ├─ Data Source ID: 3f4203d6-c726-817a-b5a7-000b81433049
  └─ Karli Standort Relation Page ID: 3f4203d6-c726-81ed-bfff-e0c4bbb19840
```

---

## Transition Classifications

| Pipeline Stage | Data Source / Method | Classification | Justification |
|---|---|---|---|
| Ebene 2 -> Ebene 3 | `Verbrauch.gs` aggregations -> `2026 In House` sheet | `AUTHORITATIVE` | Primary accounting sheet for period controlling. |
| Ebene 3 -> Exporter | `readP0PeriodRows_()` in `PeriodenKpiExporter.gs` | `DERIVED_AND_VALIDATED` | Reads raw cells, validates structure, strictly read-only. |
| Exporter -> Sync | `buildP0KpiRecord_()` & `validateP0KpiRecord_()` | `DERIVED_AND_VALIDATED` | Normalizes formats, enforces fail-closed checks. |
| Initial Seed Run | Historical test scripts (Welle 4C/4E) | `TEST_ONLY` | Injected synthetic mock data into DB 10 pages. |
