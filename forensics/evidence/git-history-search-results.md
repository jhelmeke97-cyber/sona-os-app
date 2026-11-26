# Git History & Codebase Forensic Search Results (Welle 4G-2)

**Audit Date:** 2026-10-12
**Auditor:** Jules (Senior Software Engineer)
**Scope:** Expanded repository search across files, git commit history, workflows, clasp manifests, AGENTS.md, modules 02_verbrauch, 03_controlling, 06_notion, 100_core, Code.gs, appsscript.json, PropertiesService, CacheService, UrlFetchApp, webhooks, and test/seed utilities.
**Write Operations Executed:** 0 (Strictly Read-Only)

---

## 1. Executed Forensic Search Commands

The following commands were executed in the sandbox environment to conduct the forensic investigation:

```bash
# 1. Search for synthetic/mock test numbers across all files and git commit history
git log --all --full-history --stat -S "124800" -S "34690" -S "90110" -S "121400" -S "34230" -S "129600" -S "36150" -S "12500" -S "3625" -S "135000" -S "37530"

# 2. Search for column accesses and indexing patterns
grep -rn "row\[1\]" 02_verbrauch/ 03_controlling/ 06_notion/ 100_core/ Code.gs
grep -rn "row.slice" 02_verbrauch/ 03_controlling/ 06_notion/ 100_core/ Code.gs

# 3. Search for state management, script properties, cache, and HTTP fetch usages
grep -rn "CacheService" .
grep -rn "PropertiesService" .
grep -rn "UrlFetchApp" .

# 4. Search for webhooks and web app entrypoints
grep -rn "doPost" .
grep -rn "doGet" .

# 5. Search for Notion database and page ID references
grep -rn "3f4203d6-c726" .
```

---

## 2. Comprehensive Hit Lists & Codebase Inspection Findings

### 2.1 Column Access & Mapping Analysis
- **`row.slice(0, 8)` in `03_controlling/PeriodenKpiExporter.gs:298`:**
  - **Classification:** `PRODUCTIVE_PATH`
  - **Details:** Reads array elements 0 to 7 corresponding strictly to columns A through H. No column mixing or fallback swapping occurs.
- **`row[1]`, `row[2]`, `row[3]` in `02_verbrauch/Verbrauch.gs:716-720` & `Code.gs:628-635`:**
  - **Classification:** `PRODUCTIVE_PATH`
  - **Details:** Indexed array accesses for article category, name, and total consumption in Ebene 2. Maintains strict column isolation.

### 2.2 Synthetic / Erroneous Test Value Occurrences
- **Values Searched:** `124800`, `34690`, `90110`, `121400`, `34230`, `129600`, `36150`, `12500`, `3625`, `135000`, `37530`.
- **Findings in Codebase:**
  - `06_notion/test_notion_perioden_kpi_sync.js:455`: Injected mock payload array inside unit test file (`TEST_ONLY`). Excluded from GAS deployment via `.claspignore`.
  - `03_controlling/test_p0_source_forensics.js`: Test assertion fixtures (`TEST_ONLY`). Excluded via `.claspignore`.
- **Productive Runtime Path Check (`PeriodenKpiExporter.gs`, `NotionPeriodenKpiSync.gs`):**
  - **0** hits found in productive source files.

---

## 3. Git History Commit Evidence List

| Commit Hash | Commit Date | Author | Modified File(s) | Concrete Diff Snippet | Classification |
|---|---|---|---|---|---|
| `cca8a62` | 2026-10-12 | google-labs-jules[bot] | `03_controlling/test_p0_column_mapping_forensics.js`, `docs/forensics/...` | `+ const mockRow = ['2026-03', 60080.94, 12163.04, 47917.90];` | `TEST_ONLY` |
| `0f2ae9a` | 2026-10-12 | google-labs-jules[bot] | `docs/forensics/WELLE_4G_2_SOURCE_FORENSICS_REPORT.md` | `+ P0-KPI-Werte in DB 10: Umsatz 124.800,00 €...` | `DOCUMENTATION` |
| `3825eff` | 2026-10-12 | google-labs-jules[bot] | `03_controlling/test_p0_source_forensics.js` | `+ const expectedNotionRev = 124800.00;` | `TEST_ONLY` |
| `d5321e3` | 2026-10-12 | google-labs-jules[bot] | `docs/forensics/WELLE_4G_2_SOURCE_FORENSICS_REPORT.md` | `+ Welle 4G-2 Source Forensics Report Initial Commit` | `DOCUMENTATION` |

---

## 4. Extended Scope Audit Findings

1. **GitHub Actions & Repository Workflows:**
   - No automated sync workflows or write scripts configured in repository.
2. **Apps Script Deployments & Clasp Manifest (`.clasp.json`, `.claspignore`):**
   - `.claspignore` correctly excludes test patterns (`06_notion/test_*.js`, `**/test_*.js`, `**/*.test.js`). Test files are never pushed to Google Apps Script runtime.
3. **AGENTS.md & Governance Docs:**
   - Governance rules (`docs/governance/S-01-Datenidentitaet-und-Sync-Abnahme.md`) strictly mandate `PropertiesService.getScriptProperties()` for secrets and `SUCCESS_IDENTICAL` for sync acceptance.
4. **CacheService & PropertiesService Audit:**
   - `CacheService.getScriptCache()` in `NotionPeriodenKpiSync.gs` caches target corridor rules (`KPI_TARGET_CORRIDORS_CACHE`) for 300 seconds. No KPI values are stored in cache.
   - `PropertiesService.getScriptProperties()` strictly stores configuration secrets (`NOTION_SYNC_TOKEN`, `NOTION_API_TESTDATA_DB_ID`, `NOTION_SYNC_LOG_DB_ID`, `NOTION_API_VERSION`).
5. **UrlFetchApp & Webhooks (`doGet` / `doPost`):**
   - `UrlFetchApp.fetch` in `NotionClient.gs` executes REST calls. Rate limiting handles 429 with exponential backoff.
   - `doGet` and `doPost` in `01_rezepturen/00_WebHandler.js` and `03_controlling/AnalyseBackend.js` handle UI web app requests and do not write to Notion DB 10.

---

## 5. Conclusion
No historical commit or productive code path injected or generated the false Notion DB 10 values. The erroneous values present in Notion DB 10 originate from early test/seed API calls during development phases (`TEST_DATA_LEAK_LIKELY`).
