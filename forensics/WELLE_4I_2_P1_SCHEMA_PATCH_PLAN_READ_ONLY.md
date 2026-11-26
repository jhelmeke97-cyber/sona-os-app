# WELLE_4I_2: P1 Schema Patch Plan Hotfix Contract Alignment

**Auftrag:** JULES – WELLE_4I_2_P1_SCHEMA_PATCH_PLAN_PAYLOAD_FORMAT_HOTFIX
**Status:** READ-ONLY HOTFIX CONTRACT ALIGNMENT
**Datum:** 12. Oktober 2026
**Ziel-Datei:** `docs/forensics/WELLE_4I_2_P1_SCHEMA_PATCH_PLAN_READ_ONLY.md`
**Status DB 10:** `NOT_READY` (Schreib- und Schema-Sperre aktiv, 0 Patches ausgeführt)

---

## 1. Executive Summary & Read-Only Guarantees

Dieser Hotfix stellt die vertragliche und dokumentarische Ausrichtung des **Schema-Patch-Plans für WELLE_4I_2** vor der Backend-Implementierung sicher.

In PR #65 wurde die PP-Konvention für `wareneinsatz_quote_delta_mom_pp` sowie die autoritative `quell_hash`-Regel dokumentiert. Dieser Hotfix korrigiert ausschließlich das Formatschema des Notion-API-Patch-Payloads in der Dokumentation, sodass die Notion-Number-Formate (`euro`, `percent`, `number`) exakt mit der Data-Contract-Spezifikation und der Summary-Matrix übereinstimmen.

### Strictly Read-Only Guarantees
- **0** Schema-Patches ausgeführt.
- **0** Notion-Writes / Updates ausgeführt.
- **0** Google-Sheets-Writes ausgeführt.
- **0** Produktive Code-Änderungen an `.gs` oder `.js` Dateien vorgenommen.
- **0** Deployments / `clasp push` ausgeführt.
- **0** Git-Pushes ausgeführt.
- **Status DB 10:** Strikte Beibehaltung von **`NOT_READY`**.

---

## 2. Korrektur 1 – Data Contract: `wareneinsatz_quote_delta_mom_pp`

Die Speicherkonvention für die Wareneinsatzquoten-Veränderung gegenüber der Vorperiode (MoM) ist verbindlich auf **Prozentpunkte (PP)** festgelegt.

### 2.1 Verbindliche Property-Definition

| Eigenschaft | Spezifikation |
|---|---|
| **Property Name** | `wareneinsatz_quote_delta_mom_pp` |
| **Notion-Typ** | `number` |
| **Notion-Format** | `number` |
| **Einheit** | Prozentpunkte (PP) |
| **Berechnungsformel** | `(wareneinsatz_quote_t - wareneinsatz_quote_prior) * 100` |
| **Juli 2026 Sollwert** | **`+0.12`** |
| **Anzeigeformat** | `+0,12 PP` |
| **Null-Regel** | `null` bei fehlender, ungültiger oder nicht direkt vorheriger Vorperiode bzw. fehlender WE-Quote |
| **Hash-Einbindung** | `quell_hash`: **strikt ausgeschlossen** |

### 2.2 Abgleich mit Spezifikation & Bestätigungen

- **Prozentpunkte (PP):** `wareneinsatz_quote_delta_mom_pp` speichert explizit Prozentpunkte als reelle Zahl: `0.12` = `+0,12 PP` (entspricht `20.76 - 20.64` bzw. `(0.2076 - 0.2064) * 100`).
- **Percent-Felder:** Prozentuale Deltas (`umsatz_delta_mom_pct`, `deckungsbeitrag_delta_mom_pct`, `cover_delta_mom_pct`) speichern Ratio-Werte: `0.0643` = `+6,43 %`.

---

## 3. Korrektur 2 – Autoritative Hash-Regel & Productive Audit

Die Beschreibung der produktiven Hash-Logik im Plan ist exakt an die autoritative `quell_hash`-Soll-Regel angeglichen.

### 3.1 Autoritative Quellfeld-Liste für `quell_hash`

Ausschließlich die folgenden **6 Quellfelder** fließen in den `quell_hash`:

1. `period_id` (z.B. `'2026-07'`)
2. `standort_id` (z.B. `'001'`)
3. `locationPageId` (z.B. `'3f4203d6-c726-81ed-bfff-e0c4bbb19840'`)
4. `umsatz_netto` (z.B. `71294.67`)
5. `wareneinsatz_netto` (z.B. `14801.71`)
6. `wareneinsatz_quote` (z.B. `20.76` bzw. `0.2076`)

### 3.2 Explizit ausgeschlossene Felder

Die folgenden Felder dürfen **niemals** in die `quell_hash`-Berechnung einfließen:

- `deckungsbeitrag_netto`
- `deckungsbeitrags_quote`
- `cover`
- `umsatz_pro_gast`
- `wareneinsatz_pro_gast`
- **Alle 9 P1-Delta-Properties** (`umsatz_delta_mom_netto`, `umsatz_delta_mom_pct`, `wareneinsatz_quote_delta_mom_pp`, `deckungsbeitrag_delta_mom_netto`, `deckungsbeitrag_delta_mom_pct`, `cover_delta_mom`, `cover_delta_mom_pct`, `umsatz_pro_gast_delta_mom`, `wareneinsatz_pro_gast_delta_mom`)
- `Zielkorridor`
- `kpi_status`
- `KPI-Ampel`
- `ist_aktuelle_periode`
- `sync_state`

### 3.3 Audit der produktiven Hash-Implementierung

Ein Audit der bestehenden produktiven Codebasis wurde durchgeführt:

- **Betroffene Datei:** `06_notion/NotionPeriodenKpiSync.gs`
- **Betroffene Funktion:** `computeKpiRecordHash_(kpiRecord, locationPageId)`
- **Ist-Logik im Code:**
  ```javascript
  const parts = [
    String(rec.periode || ''),
    String(rec.standort_id || rec.external_id || ''),
    String(locationPageId || ''),
    String(rec.umsatz ?? ''),
    String(rec.wareneinsatz ?? ''),
    String(weQuote ?? '')
  ];
  ```
- **Ergebnis:**
  **Die produktive Hash-Implementierung entspricht bereits zu 100% der Soll-Regel.** Es liegt keine Abweichung vor. Es sind keinerlei produktive Codeänderungen erforderlich.

---

## 4. Autoritativer Schema-Patch-Payload (Notion API)

Der folgende JSON-Payload ist der **einzige autoritative Schema-Patch-Payload** für Datenbank 10 (`3f4203d6-c726-81f0-ac8f-e7b664bc92c3`). Er definiert alle neun P1-Properties mit ihren exakten Typen und Format-Spezifikationen (`euro`, `percent`, `number`).

```json
{
  "properties": {
    "umsatz_delta_mom_netto": {
      "name": "umsatz_delta_mom_netto",
      "type": "number",
      "number": { "format": "euro" }
    },
    "umsatz_delta_mom_pct": {
      "name": "umsatz_delta_mom_pct",
      "type": "number",
      "number": { "format": "percent" }
    },
    "wareneinsatz_quote_delta_mom_pp": {
      "name": "wareneinsatz_quote_delta_mom_pp",
      "type": "number",
      "number": { "format": "number" }
    },
    "deckungsbeitrag_delta_mom_netto": {
      "name": "deckungsbeitrag_delta_mom_netto",
      "type": "number",
      "number": { "format": "euro" }
    },
    "deckungsbeitrag_delta_mom_pct": {
      "name": "deckungsbeitrag_delta_mom_pct",
      "type": "number",
      "number": { "format": "percent" }
    },
    "cover_delta_mom": {
      "name": "cover_delta_mom",
      "type": "number",
      "number": { "format": "number" }
    },
    "cover_delta_mom_pct": {
      "name": "cover_delta_mom_pct",
      "type": "number",
      "number": { "format": "percent" }
    },
    "umsatz_pro_gast_delta_mom": {
      "name": "umsatz_pro_gast_delta_mom",
      "type": "number",
      "number": { "format": "euro" }
    },
    "wareneinsatz_pro_gast_delta_mom": {
      "name": "wareneinsatz_pro_gast_delta_mom",
      "type": "number",
      "number": { "format": "euro" }
    }
  }
}
```

### Explizite Bestätigungen
1. **Autoritativer Status:** Dieser Payload ist der **einzige autoritative Schema-Patch-Payload** für die P1-Felder in Datenbank 10.
2. **Ratio-Speicherung bei Percent-Feldern:** Alle Properties vom Format `percent` (`umsatz_delta_mom_pct`, `deckungsbeitrag_delta_mom_pct`, `cover_delta_mom_pct`) speichern vertraglich Ratio-Werte: `0.0643` = `+6,43 %`.
3. **Prozentpunkte bei WE-Quote:** Property `wareneinsatz_quote_delta_mom_pp` speichert vertraglich Prozentpunkte: `0.12` = `+0,12 PP`.
4. **Schreib- und Schema-Sperre:** Status DB 10 bleibt weiterhin **`NOT_READY`**. Es erfolgte kein API-Call und kein Schema-Patch.

---

## 5. Summary Matrix aller 9 P1 Data Contracts

| Property Key | Typ | Format | Einheit / Skala | Juli 2026 Sollwert | Null-Regel bei ungültiger/fehlender Vorperiode | In `quell_hash`? |
|---|---|---|---|---|---|---|
| `umsatz_delta_mom_netto` | `number` | `euro` | EUR (`+4.306,09 €`) | `+4306.09` | `null` | NEIN |
| `umsatz_delta_mom_pct` | `number` | `percent` | Ratio (`+6,43 %`) | `+0.0643` | `null` | NEIN |
| `wareneinsatz_quote_delta_mom_pp` | `number` | `number` | **Prozentpunkte (`+0,12 PP`)** | **`+0.12`** | `null` | NEIN |
| `deckungsbeitrag_delta_mom_netto` | `number` | `euro` | EUR (`+3.332,65 €`) | `+3332.65` | `null` | NEIN |
| `deckungsbeitrag_delta_mom_pct` | `number` | `percent` | Ratio (`+6,27 %`) | `+0.0627` | `null` | NEIN |
| `cover_delta_mom` | `number` | `number` | Cover (`+182`) | `+182` | `null` | NEIN |
| `cover_delta_mom_pct` | `number` | `percent` | Ratio (`+7,57 %`) | `+0.0757` | `null` | NEIN |
| `umsatz_pro_gast_delta_mom` | `number` | `euro` | EUR/Gast (`-0,30 €`) | `-0.30` | `null` | NEIN |
| `wareneinsatz_pro_gast_delta_mom` | `number` | `euro` | EUR/Gast (`-0,02 €`) | `-0.02` | `null` | NEIN |

---

## 6. Definition of Done Checklist

- [x] Nur Schema-Patch-Plan-Dokumentation `docs/forensics/WELLE_4I_2_P1_SCHEMA_PATCH_PLAN_READ_ONLY.md` geändert.
- [x] Payload-Formate exakt wie im Auftrag gefordert (`euro`, `percent`, `number`).
- [x] Keine Änderung an PP-Konvention oder Hash-Regel.
- [x] Status DB 10 bleibt `NOT_READY`.
- [x] Bestätigung, dass percent-Felder Ratio-Werte (0.0643 = +6,43 %) und PP-Felder Prozentpunkte (0.12 = +0,12 PP) speichern.
- [x] Keine produktiven Codeänderungen vorgenommen.
- [x] Keine Schemaänderung in Notion ausgeführt.
- [x] Keine Schreibzugriffe (0 Google Sheets Writes, 0 Notion Writes).
- [x] Alle bestehenden Unit- und Integrationstests bleiben unverändert grün.

---
*Report authored by Jules (Senior Software Engineer)*
