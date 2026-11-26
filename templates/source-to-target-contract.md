# Source-to-Target Vertrag (S-01 Contract)

> **Regelkonformität:** Dieser Vertrag ist gemäß Systemregel S-01 vor der Implementierung eines jeden neuen Adapters oder vor wesentlichen Schemaänderungen vollständig auszufüllen und freizugeben.

---

## 1. Metadaten & Kontext

| Feld | Wert / Parameter |
| :--- | :--- |
| **Vertrags-ID** | `STC-[ADAPTER_ID]-[DATUM]` |
| **Adapter-ID** | `ADP-[SYSTEM]-[DOMÄNE]-[NR]` (z. B. `ADP-NOTION-EINKAUF-001`) |
| **Fachliche Ebene** | `[Ebene 0: Einkauf / Ebene 1: Rezepturen / Ebene 2: Verbrauch / Ebene 3: Controlling / etc.]` |
| **Standort-Kontext** | `['001' (Karli) / '002' (Prager) / 'ALL']` |
| **Ersteller / Autor** | `[Name / Rolle]` |
| **Datum der Erstellung** | `YYYY-MM-DD` |
| **Vertragsversion** | `v1.0.0` |
| **Status** | `[DRAFT / APPROVED / DEPRECATED]` |

---

## 2. Quellsystem-Spezifikation (Source)

| Parameter | Identifikator / Wert |
| :--- | :--- |
| **Quellsystem-Typ** | Google Sheets / Google Drive |
| **Quell-Drive-Ordner-ID** | `[DRIVE_FOLDER_ID]` |
| **Datei-ID** | `[FILE_ID]` |
| **Spreadsheet-ID** | `[SPREADSHEET_ID]` |
| **Tabellenblatt-ID (gid)** | `[TABELLENBLATT_GID]` |
| **Tabellenblatt-Name** | `[TABELLENBLATT_NAME]` |
| **Header- / Schema-Version** | `v1.0` |
| **Kopfzeile (Header Row)** | Zeile 1 |

---

## 3. Zielsystem-Spezifikation (Target)

| Parameter | Identifikator / Wert |
| :--- | :--- |
| **Zielsystem-Typ** | Notion Database |
| **Ziel-Notion-Datenbank-ID** | `[NOTION_DATABASE_ID]` |
| **Ziel-Datenbank-Name** | `[NOTION_DATABASE_NAME]` |
| **Notion API-Version** | `2022-06-28` |

---

## 4. Datenidentität & external_id

| Parameter | Regel / Definition |
| :--- | :--- |
| **external_id Definition** | `[z. B. {STANDORT_ID}_{ARTIKEL_NR}_{DATUM}]` |
| **Eindeutigkeitskriterium** | Strikt eindeutig (1:1 Beleg-/Datensatzidentität) |
| **Record-Hash Verfahren** | `SHA-256({external_id}|{field_1}|{field_2}|...)` |
| **Run-Hash Verfahren** | `SHA-256(sortierte Liste aller Record-Hashes)` |

---

## 5. Feldmapping & Transformationen

| Quellfeld (Header) | Quell-Datentyp | Zielfeld (Notion Property) | Ziel-Datentyp | Transformation / Formatierung | Mandatory? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `[Quellspalte 1]` | String | `[Notion Prop 1]` | title / rich_text | trim() | Ja |
| `[Quellspalte 2]` | Number | `[Notion Prop 2]` | number | parseFloat(), kaufm. Rundung | Ja |
| `[Quellspalte 3]` | Date | `[Notion Prop 3]` | date | ISO 8601 (`YYYY-MM-DD`) | Nein |
| `external_id` | String | `ExternalID` | rich_text | Deterministic Hash/ID | Ja |

---

## 6. Business- & Rundungsregeln

1. **Rundungsregeln:**
   - Beträge & Währungsfelder: Kaufmännische Rundung auf 2 Dezimalstellen (`Math.round(val * 100) / 100`).
   - Mengenfelder: Genauigkeit gemäß Vorgabe (z. B. 3 Dezimalstellen für kg/L).
2. **Standardwerte (Defaults):**
   - Fehlt ein optionales Feld im Quellsystem, wird `null` bzw. leer übermittelt.
3. **Sonderzeichen & Enkodierung:**
   - UTF-8 Enkodierung für alle Textfelder.

---

## 7. Validierungsregeln

- [ ] **Pflichtfelder:** Alle als mandatory markierten Felder müssen Nicht-Null und Nicht-Leer sein.
- [ ] **Typkonformität:** Alle Zahlen- und Datumsfelder müssen vor der Übertragung erfolgreich geparst werden.
- [ ] **Standortisolierung:** `standortId` muss exakt mit dem zulässigen Standort-Kontext (`'001'` oder `'002'`) übereinstimmen.
- [ ] **Dublettenfreiheit:** Keine doppelten `external_id` Werte im Quell- oder Zielset erlaubt.

---

## 8. Abnahmekriterien (S-01 Checkliste)

Ein Sync-Lauf gemäß diesem Vertrag gilt nur dann als abgenommen, wenn:
1. [ ] Die Source-Identity vollkommen valide und dublettenfrei ist (`FAILED_SOURCE_IDENTITY` ausgeschlossen).
2. [ ] Ein Dry Run ohne Schreibzugriffe erfolgreich mit Status `DRY_RUN_IDENTICAL` abgeschlossen wurde.
3. [ ] Eine explizite fachliche Freigabe vorliegt.
4. [ ] Der anschließende Schreiblauf im Post-Write-Abgleich zu 100 % Werte-, ID- und Hashgleichheit aufweist und den Status `SUCCESS_IDENTICAL` liefert.

---

## 9. Freigabe & Sign-Off

| Rolle | Name / Kürzel | Datum | Status |
| :--- | :--- | :--- | :--- |
| **Entwickler / Adapter-Author** | `[Name]` | `YYYY-MM-DD` | `[APPROVED]` |
| **Fachlicher Reviewer** | `[Name]` | `YYYY-MM-DD` | `[APPROVED]` |
