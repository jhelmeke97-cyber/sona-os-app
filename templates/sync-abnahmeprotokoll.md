# Sync-Abnahmeprotokoll (S-01 Protocol)

> **Regelkonformität:** Gemäß Systemregel S-01 muss für jeden Synchronisationslauf (Dry Run sowie produktiver Schreiblauf) ein Abnahmeprotokoll angefertigt werden. Ohne den Ergebnisstatus `SUCCESS_IDENTICAL` (oder `DRY_RUN_IDENTICAL` im Test) gilt ein Lauf als **nicht fachlich abgenommen**.

---

## 1. Lauf-Metadaten & Identifikation

| Parameter | Wert / Details |
| :--- | :--- |
| **Protokoll-ID** | `PROT-[DATUM]-[CORRELATION_ID]` |
| **Lauf-ID / Correlation-ID** | `[CORRELATION_ID / UUID]` |
| **Vertrags-ID (Source-to-Target Contract)** | `[STC_ID]` |
| **Adapter-ID & Code-Version** | `[ADP_ID] @ v[X.Y.Z]` |
| **Ausführungszeitpunkt (Start - Ende)** | `YYYY-MM-DD HH:MM:SS` bis `YYYY-MM-DD HH:MM:SS` |
| **Ausführungstyp** | `[DRY_RUN / PRODUCTIVE_WRITE]` |
| **Ausgeführt durch / Trigger** | `[User / Script App / Automated Job]` |

---

## 2. Quelle & Ziel

| System | Name / Beschreibung | Technische ID |
| :--- | :--- | :--- |
| **Quelle (Source)** | `[Spreadsheet Name / Tabellenblatt]` | `[SPREADSHEET_ID] # [TABELLENBLATT_NAME]` |
| **Ziel (Target)** | `[Notion Database Name]` | `[NOTION_DATABASE_ID]` |
| **Standort-Kontext** | `['001' (Karli) / '002' (Prager)]` | Validiert via `isValidStandortId()` |

---

## 3. Datenidentitäts- & Quantitätsabgleich

| Prüfschritt | Quelle (Source) | Ziel (Target) | Abweichung | Ergebnis |
| :--- | :--- | :--- | :--- | :--- |
| **Zeilenanzahl / Records** | `[Anzahl]` | `[Anzahl]` | `[0 / Delta]` | `[OK / FAIL]` |
| **Gefilterte / Ausgeschlossene Records** | `[Anzahl]` | `[Anzahl]` | `[0 / Delta]` | `[OK / FAIL]` |
| **Eindeutige Quell-IDs (`external_id`)** | `[Anzahl]` | - | - | `[OK / FAIL]` |
| **Vollständigkeit ID-Match (1:1)** | `[Anzahl matched]` | `[Anzahl matched]` | `[0]` | `[OK / FAIL]` |

---

## 4. Record-Hash, Run-Hash & Summenreconciliation

| Identifikator / Check | Quellwert / Erwartung | Zielwert / IST | Übereinstimmung? |
| :--- | :--- | :--- | :--- |
| **Quell-Run-Hash (Source Run Hash)** | `[HASH_SHA256]` | - | - |
| **Ziel-Run-Hash (Target Run Hash)** | - | `[HASH_SHA256]` | `[MATCH / MISMATCH]` |
| **Prüfsumme Feld 1 (z.B. Nettobetrag)** | `[Summe EUR]` | `[Summe EUR]` | `[MATCH / MISMATCH]` |
| **Prüfsumme Feld 2 (z.B. Gesamtmenge)**| `[Summe Menge]` | `[Summe Menge]` | `[MATCH / MISMATCH]` |
| **Feldgenauer Vergleich (100% Fields)** | `100% OK` | `100% OK` | `[MATCH / MISMATCH]` |

---

## 5. Abweichungen & Fehlerprotokoll

| Record `external_id` | Betroffenes Feld | Quellwert | Zielwert | Fehlerursache / Anmerkung |
| :--- | :--- | :--- | :--- | :--- |
| *[Keine Abweichungen]* | - | - | - | - |

*(Trage hier im Fehlerfall Einzelabweichungen oder Fehlermeldungen ein)*

---

## 6. Ergebnisstatus (Gültige S-01 Statuswerte)

**Ausgewählter Ergebnisstatus:**
`[ ] SUCCESS_IDENTICAL` *(Gilt als fachlich abgenommen)*
`[ ] DRY_RUN_IDENTICAL` *(Erfolgreicher Testlauf ohne Schreibvorgang)*
`[ ] FAILED_SOURCE_IDENTITY` *(Quelldaten unvollständig/fehlerhaft)*
`[ ] FAILED_IDENTITY_CHECK` *(ID-Abgleich fehlerhaft)*
`[ ] FAILED_MAPPING_VALIDATION` *(Schema/Mapping-Validierung fehlgeschlagen)*
`[ ] FAILED_RECONCILIATION` *(Hash- oder Summenabweichung)*
`[ ] FAILED_TECHNICAL` *(Technischer Abbruch / API-Fehler)*

---

## 7. Fachliche Freigabe & Sign-Off

> **Erklärung:** Ich bestätige hiermit, dass der obige Synchronisationslauf nach den Kriterien der Systemregel S-01 geprüft und bewertet wurde.

| Rolle | Name / Kürzel | Datum | Entscheidung |
| :--- | :--- | :--- | :--- |
| **Technischer Durchführer** | `[Name]` | `YYYY-MM-DD` | `[FREIGEGEBEN / ABGELEHNT]` |
| **Fachlicher Abnehmer (Reviewer)**| `[Name]` | `YYYY-MM-DD` | `[FREIGEGEBEN / ABGELEHNT]` |
