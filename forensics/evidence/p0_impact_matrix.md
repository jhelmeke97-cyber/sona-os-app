# P0 Data Logic Forensic Impact Matrix (Welle 4G-2)

**Audit Date:** 2026-10-12
**Auditor:** Jules (Senior Software Engineer)
**Status:** Strictly Read-Only

---

## Domain Impact Assessment

| System / Module | Feature / Component | Impact Level | Classification | Impact Details & Remediation Requirement |
|---|---|---|---|---|
| **Notion DB 10** | Revenue, WE & Cover Trends (Karli 2026-03..07) | High | `DIRECT_IMPACT` / `PROVEN` | DB 10 (`3f4203d6-c726-81f0-ac8f-e7b664bc92c3`, Data Source `3f4203d6-c726-817a-b5a7-000b81433049`) displays synthetic test numbers. Requires future read-only dry run / remediation patch. |
| **Notion Cockpit** | Karli Dashboard 001 Views | Medium | `INDIRECT_IMPACT` / `PROVEN` | Linked relations in Karli Cockpit reflect DB 10 synthetic numbers. Will auto-resolve upon DB 10 data remediation. |
| **Google Sheets** | `2026 In House` Tab (`1QDVsqbIbiGIrpcaj8YX904Az35p9Aw8MSNQMU2gAmxs`) | None | Nicht als betroffen belegt | Clean authoritative source since inception. Zero writes executed. |
| **Google Sheets** | `KPI_ZIELKORRIDORE` Tab | None | Nicht als betroffen belegt | Target corridor configuration active and intact. Zero writes executed. |
| **Ebene 2** | Verbrauch & Portfolio | None | Nicht als betroffen belegt | Article consumption logic independent of Notion DB 10. |
| **Ebene 3** | Controlling & Periodenvergleich | None | Nicht als betroffen belegt | Sheet-based controlling logic independent of Notion DB 10. |
| **04 Sonderfälle** | Schwund & Bruch | None | Nicht als betroffen belegt | Independent sub-system. |
| **05 Sona Hub** | Central Consolidation & Sync | None | Nicht als betroffen belegt | Consolidation logic independent of Notion DB 10. |
| **Standort 002** | Prager Standort Daten | None | Nicht als betroffen belegt | Standort isolation verified; zero impact on Prager. |
| **Weitere Systeme** | Unberücksichtigte Subsysteme / Webhooks | TBD | `NOT_YET_FULLY_VERIFIED` | Pending further live integrations audit. |
