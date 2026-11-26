# Welle 4G-2: Full Data Logic Forensics and Remediation Plan Report

**Report ID:** `WELLE_4G_2_FULL_DATA_LOGIC_FORENSICS_AND_REMEDIATION_PLAN_READ_ONLY`
**Audit Date:** 2026-10-12
**Auditor:** Jules (Senior Software Engineer)
**Status:** Strictly Read-Only (0 Writes Executed)

---

## 1. Context & Precise System Identifiers

The system structure uses the following verified IDs:
- **Parent Page ID (Controlling Page):** `3f4203d6-c726-8045-aa2a-d3fc664d7df5`
  *(Note: This Parent Page ID is a page container and is never described as a Database ID or Query target).*
- **DB-10 Database ID (`10 · Perioden-KPI`):** `3f4203d6-c726-81f0-ac8f-e7b664bc92c3`
- **DB-10 Data Source ID:** `3f4203d6-c726-817a-b5a7-000b81433049`
- **Karli Standort Page ID (`001 · Karli`):** `3f4203d6-c726-81ed-bfff-e0c4bbb19840`

---

## 2. Executive Summary

### 2.1 Usefulness of Current Notion DB 10 P0 Data
The current values stored in Notion DB 10 (`3f4203d6-c726-81f0-ac8f-e7b664bc92c3`, Data Source `3f4203d6-c726-817a-b5a7-000b81433049`) for Standort `001 · Karli` across periods `2026-03` to `2026-07` are **fachlich nicht verwendbar** (domain invalid). They contain synthetic placeholder numbers (e.g., revenue 124.800,00 € vs true source 60.080,94 €).

### 2.2 Root Cause Assessment
The root cause is classified as **`TEST_DATA_LEAK_LIKELY`** (Evidence Level: **LIKELY**).
The five pages in Notion DB 10 were created during early test phases (Welle 4C/4E) using synthetic test seed data. The authoritative source spreadsheet `1QDVsqbIbiGIrpcaj8YX904Az35p9Aw8MSNQMU2gAmxs` (tab `2026 In House`) has contained the correct authoritative numbers since inception. No column summation error, formula error, or data mapping error exists in the production codebase.

### 2.3 Impact Summary
- **Notion DB 10 (001 · Karli 2026-03..07):** `DIRECT_IMPACT` / `PROVEN`
- **Karli Cockpit:** `INDIRECT_IMPACT` / `PROVEN`
- **Ebene 2, Ebene 3, Sona Hub, Standort 002 Prager:** Nicht als betroffen belegt.
- **Alle weiteren Systeme:** `NOT_YET_FULLY_VERIFIED`

---

## 3. Phase 1 – Full Codebase & Git History Forensic Search Findings

A comprehensive search was conducted across all repository files and git commit history for column accesses, erroneous test numbers, seed indicators, and data paths.

### Key Finding Summary:
1. **Column Accesses (`row[1]`, `row[2]`, `row[3]`, `row.slice(0, 8)`):**
   - Located in `02_verbrauch/Verbrauch.gs`, `03_controlling/PeriodenKpiExporter.gs`, and `Code.gs`.
   - All column accesses strictly maintain isolation. No function combines columns B, C, D into a single sum or uses them as fallbacks for each other.
2. **Erroneous Test Numbers (`124800`, `34690`, `90110`, etc.):**
   - Found exclusively in test files (`06_notion/test_notion_perioden_kpi_sync.js`, `03_controlling/test_p0_source_forensics.js`) and historical documentation commits (`0f2ae9a`, `3825eff`).
   - Zero occurrences in productive runtime paths (`03_controlling/PeriodenKpiExporter.gs`, `06_notion/NotionPeriodenKpiSync.gs`).
3. **Seed & Mock Indicators (`NotionTestDataAdapter`, `testData`, `mockSheetValues`):**
   - `NotionTestDataAdapter.gs` targets database `98 · API-Testdaten` and does not interact with DB 10.
   - Test adapters are strictly excluded from Google Apps Script deployment via `.claspignore` (`**/test_*.js`).

---

## 4. Phase 2 – Mathematical Hypothesis Testing Matrix Summary

For each period 2026-03 to 2026-07, candidate formulas (B, C, D, B+C, B+D, C+D, B+C+D, 2*B, B-C) were tested against current Notion values in `docs/forensics/evidence/p0_column_formula_analysis.csv`.

### Source Values (Google Sheet `2026 In House`):
- **2026-03:** B=60.080,94 €, C=12.163,04 €, D=47.917,90 €
- **2026-04:** B=61.289,99 €, C=12.347,74 €, D=48.942,25 €
- **2026-05:** B=72.005,82 €, C=14.642,36 €, D=57.363,46 €
- **2026-06:** B=66.988,58 €, C=13.828,26 €, D=53.160,31 €
- **2026-07:** B=71.294,67 €, C=14.801,71 €, D=56.492,96 €

### Mathematical Conclusion:
No combination formula matches the values in Notion DB 10. All candidate formulas return **`NO_MATCH`** (with incidental numerical closeness in isolated values classified as `CLOSE` due to scale without formula relationship), proving that the incorrect values do not result from mathematical mis-aggregation of source columns.

---

## 5. Phase 3 – Full Data Flow Audit

The technical chain from source to target is structured as follows:

1. **Ebene 2 · Verbrauch:**
   - Article-level invoices and POS sales aggregated into monthly totals.
   - Classification: `AUTHORITATIVE`.
2. **Ebene 3 · Controlling (`2026 In House` Tab under Parent Page `3f4203d6-c726-8045-aa2a-d3fc664d7df5`):**
   - Columns B (Netto-Umsatz), C (WE Total), D (Deckungsbeitrag) populated cleanly.
   - Row 15 contains summary totals and is explicitly ignored.
   - Classification: `AUTHORITATIVE`.
3. **P0 Exporter (`PeriodenKpiExporter.gs`):**
   - `readP0PeriodRows_()` reads rows 3 to 14, ignoring row 15.
   - `buildP0KpiRecord_()` formats values strictly as read. Only derived metric allowed is `deckungsbeitrags_quote = D / B`.
   - Classification: `DERIVED_AND_VALIDATED`.
4. **Notion Export (`NotionPeriodenKpiSync.gs`):**
   - Maps canonical record to Notion DB 10 (`3f4203d6-c726-81f0-ac8f-e7b664bc92c3`, Data Source `3f4203d6-c726-817a-b5a7-000b81433049`) properties with target corridor traffic light status.
   - Initial DB 10 page creation (Welle 4C/4E): `TEST_ONLY` (injected mock seed values).

---

## 6. Phase 4 – Impact Analysis & System Classifications

- **Notion DB 10 (001 · Karli 2026-03..07):** `DIRECT_IMPACT` / `PROVEN`
- **Notion Cockpit (Karli Dashboard 001):** `INDIRECT_IMPACT` / `PROVEN`
- **Google Sheets Backend (`2026 In House`, `KPI_ZIELKORRIDORE`):** Nicht als betroffen belegt.
- **Ebene 2 / Ebene 3 / Sona Hub:** Nicht als betroffen belegt.
- **Standort 002 Prager:** Nicht als betroffen belegt.
- **Alle weiteren Systeme:** `NOT_YET_FULLY_VERIFIED`

---

## 7. Phase 5 – Root Cause Classification

**Final Classification:** **`TEST_DATA_LEAK_LIKELY`**
**Evidence Level:** **LIKELY**

### Evidence Summary:
1. Google Sheets source tab `2026 In House` contains exact real values (`60.080,94 €` for 2026-03).
2. Production code in `PeriodenKpiExporter.gs` reads these true values correctly when executed.
3. Mathematical hypothesis testing proves zero match between candidate formula combinations and Notion DB 10 values (`NO_MATCH`).
4. Erroneous values exist solely inside Notion DB 10 pages created during early Welle 4C/4E test runs.

---

## 8. Phase 6 – Remediation Strategy (PLANNING ONLY)

*Note: Per Welle 4G-2 rules, no executable patch script is included to prevent misinterpretation as a runnable patch.*

### 8.1 Data Remediation Plan
For the 5 affected Notion pages in DB 10 (`3f4203d6-c726-81f0-ac8f-e7b664bc92c3`, Data Source `3f4203d6-c726-817a-b5a7-000b81433049`) for Standort `001 · Karli` (`3f4203d6-c726-81ed-bfff-e0c4bbb19840`):

| External ID | Current Revenue | Authoritative Target Revenue | Current WE | Authoritative Target WE | Target Hash Concept |
|---|---|---|---|---|---|
| `001:2026-03` | 124.800,00 € | **60.080,94 €** | 34.690,00 € | **12.163,04 €** | `computeKpiRecordHash_` |
| `001:2026-04` | 121.400,00 € | **61.289,99 €** | 34.230,00 € | **12.347,74 €** | `computeKpiRecordHash_` |
| `001:2026-05` | 129.600,00 € | **72.005,82 €** | 36.150,00 € | **14.642,36 €** | `computeKpiRecordHash_` |
| `001:2026-06` | 12.500,00 € | **66.988,58 €** | 3.625,00 € | **13.828,26 €** | `computeKpiRecordHash_` |
| `001:2026-07` | 135.000,00 € | **71.294,67 €** | 37.530,00 € | **14.801,71 €** | `computeKpiRecordHash_` |

---

## 9. Explicit Confirmations

- **0** Google Sheets writes performed.
- **0** Notion writes / updates / page creations performed.
- **0** Schema changes performed.
- **0** `quell_hash` modifications performed.
- **0** Deployments / `clasp push` executed.
- **0** Git pushes to `main` performed.
- PR created for documentation/test diagnostics only and **NOT merged**.

---
*Report authored by Jules (Senior Software Engineer)*
