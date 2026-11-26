# Systemregel S-01: Datenidentität & Sync-Abnahme

## 1. Verbindlicher Grundsatz & Zielsetzung
Diese Systemregel (S-01) definiert die verbindlichen Standards für die Datenidentität, Schemaverträge und die fachlich-technische Abnahme von Synchronisationsläufen zwischen der **Sona Warenwirtschaft** (Google Sheets / Drive) und externen Zielsystemen (insbesondere **Notion**).

**Hauptsatz:**
> Der Zielbestand muss nach freigegebenen, versionierten Transformationen vollkommen identisch mit dem freigegebenen Quelldatenbestand sein.

---

## 2. Anforderungen an die Datenidentität

Eine bloße Summen- oder Zeilenanzahlgleichheit reicht ausdrücklich **nicht** aus, um eine erfolgreiche Datensynchronisation festzustellen.

Für jeden abgenommenen Sync-Vorgang sind folgende Elemente zwingend vorgeschrieben:

1. **Eindeutige `external_id`:** Jeder Datensatz muss über einen eindeutigen, deterministischen Primärschlüssel verfügen, der Quelle und Ziel eineindeutig verknüpft.
2. **Vollständiger ID-Abgleich:** Sämtliche Quell-IDs müssen gegen die Ziel-IDs gematcht werden (Vollständigkeit und Exklusivität, keine verwaisten Datensätze).
3. **Feldgenauer Vergleich:** Jedes gemappte Feld wird auf Wertegleichheit nach definierten Transformations- und Rundungsregeln geprüft.
4. **Record-Hash:** Für jeden Einzeldatenwert bzw. Record wird ein Hashwert (z. B. SHA-256 über alle relevanten Felder in deterministischer Sortierung) berechnet und abgeglichen.
5. **Run-Hash:** Für den Gesamtdatenstand eines Synchronisationslaufs wird ein zusammenfassender Run-Hash über alle Record-Hashes ermittelt.
6. **Vorher-/Nachher-Abgleich:** Systematischer Vorher-/Nachher-Vergleich zur Absicherung, dass keine unbeabsichtigten Mutation, Löschung oder Duplizierung stattgefunden hat.

---

## 3. Pflicht zur Erstellung eines Source-to-Target-Vertrags

Vor der Implementierung eines jeden neuen Adapters oder der Modifikation bestehender Sync-Schnittstellen muss ein formaler **Source-to-Target-Vertrag** auf Basis der Vorlage `docs/templates/source-to-target-contract.md` angelegt und freigegeben werden.

Der Vertrag muss zwingend folgende Angaben umfassen:
- **Adapter-ID** (z. B. `ADP-NOTION-EINKAUF-001`)
- **Fachliche Ebene** (z. B. `Ebene 0: Einkauf`, `Ebene 1: Rezepturen`, `Ebene 2: Verbrauch`, `Ebene 3: Controlling`)
- **Standort** (z. B. `'001'` Sona Karli, `'002'` Sona Prager oder `'ALL'`)
- **Quell-Drive-Ordner-ID**
- **Datei-ID**
- **Spreadsheet-ID**
- **Tabellenblatt-ID und -Name**
- **Header-/Schema-Version**
- **Ziel-Notion-Datenbank-ID**
- **`external_id`-Definition** (Regel zur Generierung des eindeutigen Schlüssels)
- **Feldmapping** (Quellfeld -> Zielfeld)
- **Transformationen** (Typkonvertierungen, Formatierungen)
- **Rundungsregeln** (z. B. kaufmännische Rundung auf 2 Dezimalstellen bei Währungsbeträgen)
- **Validierungsregeln** (Pflichtfelder, Wertebereiche, RegEx)
- **Abnahmekriterien**

---

## 4. Definiertes Katalog der Abschlussstatus

Jeder Synchronisationslauf muss nach Ausführung genau einen der folgenden vordefinierten Abschlussstatus zurückgeben:

| Status | Kategorie | Beschreibung |
| :--- | :--- | :--- |
| `SUCCESS_IDENTICAL` | Erfolgreich | Produktiver Schreiblauf war zu 100 % identisch und erfolgreich abgenommen. |
| `DRY_RUN_IDENTICAL` | Erfolgreich (Simulation) | Dry Run (Testlauf ohne Schreiben) verlief ohne Abweichungen. |
| `FAILED_SOURCE_IDENTITY` | Fehler | Quelldaten sind in sich fehlerhaft, unvollständig oder nicht eindeutig. |
| `FAILED_IDENTITY_CHECK` | Fehler | ID-Abgleich oder Match zwischen Quell- und Ziel-IDs schlug fehl. |
| `FAILED_MAPPING_VALIDATION` | Fehler | Validierungsfehler bei Feldmapping, Schema oder Datentypen. |
| `FAILED_RECONCILIATION` | Fehler | Abweichung beim Record-Hash, Run-Hash, Summen- oder Feldvergleich. |
| `FAILED_TECHNICAL` | Fehler | Technischer Fehler (Netzwerk, Rate Limit, API-Timeout, Authentication). |

---

## 5. Voraussetzungen für produktive Schreibläufe

Kein produktiver Schreiblauf darf ausgeführt oder als gültig anerkannt werden ohne:

1. **Erfolgreiche Source-Identity-Prüfung:** Nachweis der Integrität und Eindeutigkeit des Quelldatenbestands.
2. **Erfolgreiche Schema- und Berechtigungsprüfung:** Validierung von Quell- und Zielstrukturen sowie API-Zugriffsrechten.
3. **Vollständigen Dry Run:** Erfolgreiche Simulation des Syncs mit Status `DRY_RUN_IDENTICAL`.
4. **Explizite fachliche Freigabe:** Schriftliche oder protokollierte Freigabe durch die zuständige Fachrolle.
5. **Erfolgreichen Post-Write-Abgleich:** Unmittelbarer Abgleich nach dem Schreiblauf mit Status `SUCCESS_IDENTICAL`.

---

## 6. Sicherheitsrichtlinien & Geheimhaltungsregeln

- **Keine Secrets im Repository:** API-Keys, Bearer-Tokens, Passwörter oder vertrauliche Zugangsdaten dürfen **unter keinen Umständen** in Code, READMEs, Commits, Pull Requests, Issue-Beschreibungen, Logs oder Testfixtures enthalten sein.
- **Speicherort für Secrets:** Zugangsdaten und Tokens verbleiben ausschließlich in den `Script Properties` (via `PropertiesService.getScriptProperties()`) bzw. dem hierfür vorgesehenen Secret Store.
- **Referenzierung technischer IDs:** Öffentliche oder interne technische IDs (z. B. Spreadsheet-IDs, Notion Database-IDs) dürfen als Referenzen in Dokumenten und Verträgen aufgeführt werden, solange keine Authentifizierungsinformationen offengelegt werden.
