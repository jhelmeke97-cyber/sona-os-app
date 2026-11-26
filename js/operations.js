'use strict';

(function() {
  const OPS_STATE = {
    activeTab: 'reklamation',
    selectedMonth: '',
    meta: null,
    selectedArt: 'Gäste im Haus',
    selectedBereich: ''
  };

  function esc(val) {
    return String(val == null ? '' : val).replace(/[&<>"']/g, function(m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function fmtEur(val) {
    if (val === null || val === undefined || isNaN(Number(val))) return '–';
    return Number(val).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtNum(val, digits) {
    if (val === null || val === undefined || isNaN(Number(val))) return '–';
    const d = digits !== undefined ? digits : 2;
    return Number(val).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function todayIsoLocal() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function getSavedOpsName(session) {
    const uid = (session && session.user && session.user.id) ? String(session.user.id) : '';
    const fallback = (session && session.user && session.user.name) ? String(session.user.name).trim() : '';
    if (!uid) return fallback;
    try {
      const saved = localStorage.getItem('sona_os_ops_name_' + uid);
      if (saved && saved.trim()) return saved.trim();
    } catch (e) {}
    return fallback;
  }

  function saveOpsName(session, nameVal) {
    const uid = (session && session.user && session.user.id) ? String(session.user.id) : '';
    const clean = String(nameVal || '').trim();
    if (!uid || !clean) return;
    try {
      localStorage.setItem('sona_os_ops_name_' + uid, clean);
    } catch (e) {}
  }

  function openExternalTab(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return false;
  }

  async function loadSchwundOverview(session) {
    const slot = document.getElementById('opsSchwundKpiSlot');
    if (!slot) return;
    slot.innerHTML = '<div class="card"><div class="kicker">Schwund-Übersicht</div><p class="module-desc">Lade aktuelle Perioden-Kennzahlen und Schwund-Positionen …</p></div>';

    try {
      const res = await window.SonaApi.getBestandDashboard(session.standortId, { mode: 'SINGLE_MONTH' }, false);
      const currentSlot = document.getElementById('opsSchwundKpiSlot');
      if (!currentSlot) return;

      if (!res || res.success === false) {
        currentSlot.innerHTML =
          '<div class="card">' +
            '<div class="kicker">Schwund-Kennzahlen</div>' +
            '<h3>Aktuelle Periode konnte nicht geladen werden</h3>' +
            '<p class="module-desc">' + esc((res && res.error) || 'Unbekannter Fehler.') + '</p>' +
          '</div>';
        return;
      }

      const cur = res.currentTotals || {};
      const periodId = (res.selection && res.selection.currentPeriodIds && res.selection.currentPeriodIds[0]) || '';
      const periodObj = (Array.isArray(res.periods) ? res.periods : []).find(function(p) { return p.period_id === periodId; });
      const periodLabel = (periodObj && periodObj.label) || periodId || 'Aktuelle Periode';

      const lossItems = (Array.isArray(res.matrixItems) ? res.matrixItems : [])
        .filter(function(it) { return (Number(it.net_value_documented_loss) || 0) > 0 || (Number(it.quantity_documented_loss) || 0) > 0; })
        .slice()
        .sort(function(a, b) { return (Number(b.net_value_documented_loss) || 0) - (Number(a.net_value_documented_loss) || 0); });

      const rows = lossItems.slice(0, 12).map(function(it) {
        return '<tr>' +
          '<td><b>' + esc(it.master_ingredient_name || it.master_ingredient_id) + '</b><div style="font-size:10.5px;color:var(--os-silk);">' + esc(it.category || '–') + '</div></td>' +
          '<td class="tabular">' + fmtNum(it.quantity_documented_loss, 2) + ' ' + esc(it.reference_unit || '') + '</td>' +
          '<td class="tabular">' + fmtEur(it.net_value_documented_loss) + '</td>' +
        '</tr>';
      }).join('');

      currentSlot.innerHTML =
        '<div class="card">' +
          '<div class="card-head">' +
            '<div>' +
              '<div class="kicker">Schwund-Übersicht · ' + esc(periodLabel) + '</div>' +
              '<h3>Schwund-Kennzahlen &amp; Top-Positionen</h3>' +
            '</div>' +
            '<span class="badge">' + esc(session.standortName) + '</span>' +
          '</div>' +
          '<div class="grid-3" style="margin-bottom:14px;">' +
            '<div class="bv-kpi-card"><div class="kicker">Dok. Schwund (Periode)</div><div class="bv-kpi-val tabular">' + fmtEur(cur.net_value_documented_loss) + '</div></div>' +
            '<div class="bv-kpi-card"><div class="kicker">Betroffene Positionen</div><div class="bv-kpi-val tabular">' + esc(lossItems.length) + '</div></div>' +
            '<div class="bv-kpi-card"><div class="kicker">Kassen-Warenverbrauch</div><div class="bv-kpi-val tabular">' + fmtEur(cur.net_value_consumed_sales) + '</div></div>' +
          '</div>' +
          '<div class="table-wrap"><table><thead><tr>' +
            '<th>Position / Zutat</th><th>Schwund-Menge</th><th>Warenwert (Netto)</th>' +
          '</tr></thead><tbody>' +
            (rows || '<tr><td colspan="3">Keine dokumentierten Schwund-Positionen in dieser Periode.</td></tr>') +
          '</tbody></table></div>' +
        '</div>';
    } catch (err) {
      const currentSlot = document.getElementById('opsSchwundKpiSlot');
      if (!currentSlot) return;
      currentSlot.innerHTML =
        '<div class="card">' +
          '<div class="kicker">Schwund-Kennzahlen</div>' +
          '<p class="module-desc">Fehler beim Laden der Schwund-Übersicht: ' + esc(err && err.message ? err.message : String(err)) + '</p>' +
        '</div>';
    }
  }

  function renderReklamationChoices(containerId, options, selectedVal, onPick) {
    const box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = (options || []).map(function(opt) {
      const active = opt === selectedVal ? ' active' : '';
      return '<button type="button" class="ops-choice-btn' + active + '" data-choice="' + esc(opt) + '">' + esc(opt) + '</button>';
    }).join('');
    box.querySelectorAll('.ops-choice-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        box.querySelectorAll('.ops-choice-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        onPick(btn.dataset.choice);
      });
    });
  }

  function renderReklamationRecentTable(meta) {
    const tbody = document.getElementById('opsRekRecentBody');
    const titleEl = document.getElementById('opsRekRecentTitle');
    const badgeEl = document.getElementById('opsRekCountBadge');
    if (titleEl && meta && meta.sheetName) {
      titleEl.textContent = 'Letzte Einträge – ' + meta.sheetName;
    }
    if (badgeEl && meta) {
      badgeEl.textContent = String(meta.totalMonthCount || 0) + ' Einträge';
    }
    if (!tbody) return;
    const list = (meta && Array.isArray(meta.recentEntries)) ? meta.recentEntries : [];
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5">Noch keine Einträge in diesem Monat.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function(e) {
      return '<tr>' +
        '<td style="white-space:nowrap;">' + esc(e.date || '–') + '</td>' +
        '<td style="white-space:nowrap;"><span class="badge">' + esc(e.art || '–') + '</span></td>' +
        '<td style="white-space:nowrap;"><span class="badge badge-warn">' + esc(e.bereich || '–') + '</span></td>' +
        '<td style="max-width:440px;white-space:pre-wrap;line-height:1.45;">' + esc(e.bemerkung || '') + '</td>' +
        '<td style="white-space:nowrap;"><b>' + esc(e.name || '–') + '</b></td>' +
      '</tr>';
    }).join('');
  }

  async function loadReklamationTab(session, requestedMonth) {
    const pane = document.getElementById('opsTabPane');
    if (!pane) return;

    pane.innerHTML =
      '<div class="card">' +
        '<div class="kicker">Gäste-Reklamation · ' + esc(session.standortName) + '</div>' +
        '<p class="module-desc">Lade Monatsblatt &amp; Dropdown-Optionen aus der Reklamations-Tabelle …</p>' +
      '</div>';

    try {
      const res = await window.SonaApi.getOpsReklamationMeta(session.standortId, requestedMonth || OPS_STATE.selectedMonth || '');
      if (!document.getElementById('opsTabPane')) return;

      if (!res || !res.success) {
        pane.innerHTML =
          '<div class="card">' +
            '<div class="kicker">Gäste-Reklamation</div>' +
            '<h3>Tabelle konnte nicht geladen werden</h3>' +
            '<p class="module-desc">' + esc((res && res.error) || 'Unbekannter Fehler.') + '</p>' +
          '</div>';
        return;
      }

      if (res.status === 'IN_VORBEREITUNG') {
        pane.innerHTML =
          '<div class="card">' +
            '<div class="kicker">Gäste-Reklamation · ' + esc(session.standortName) + '</div>' +
            '<h3>Noch nicht für diesen Standort verknüpft</h3>' +
            '<p class="module-desc">' + esc(res.message || 'Für diesen Standort ist noch keine Reklamations-Tabelle hinterlegt.') + '</p>' +
          '</div>';
        return;
      }

      OPS_STATE.meta = res;
      OPS_STATE.selectedMonth = res.sheetName || '';
      OPS_STATE.selectedArt = res.defaultArt || 'Gäste im Haus';
      OPS_STATE.selectedBereich = res.defaultBereich || (res.bereichOptions && res.bereichOptions[0]) || 'Beschwerde';

      const defaultName = getSavedOpsName(session);
      const months = Array.isArray(res.availableMonths) && res.availableMonths.length ? res.availableMonths : [res.sheetName];

      pane.innerHTML =
        '<div class="card" style="margin-bottom:16px;">' +
          '<div class="card-head">' +
            '<div>' +
              '<div class="kicker">Gäste &amp; Lieferung · Direktspeicherung in Google Sheets</div>' +
              '<h3>Gäste-Reklamation erfassen</h3>' +
            '</div>' +
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
              '<select id="opsRekMonthSelect" class="input-control" style="height:32px;width:auto;min-width:130px;">' +
                months.map(function(m) {
                  return '<option value="' + esc(m) + '"' + (m === res.sheetName ? ' selected' : '') + '>' + esc(m) + '</option>';
                }).join('') +
              '</select>' +
              '<span id="opsRekCountBadge" class="badge">' + esc(res.totalMonthCount || 0) + ' Einträge</span>' +
              '<button type="button" id="btnReloadReklamation" class="btn btn-sm">Aktualisieren</button>' +
            '</div>' +
          '</div>' +

          '<div id="opsRekError" class="lock-error hidden"></div>' +
          '<div id="opsRekSuccess" class="lock-success hidden"></div>' +

          '<div class="user-modal-grid">' +
            '<div class="form-field">' +
              '<label class="kicker" for="opsRekDate">1. Datum</label>' +
              '<input type="date" id="opsRekDate" class="input-control" value="' + esc(todayIsoLocal()) + '">' +
            '</div>' +
            '<div class="form-field">' +
              '<label class="kicker" for="opsRekName">5. Name (automatisch aus Profil)</label>' +
              '<input type="text" id="opsRekName" class="input-control" maxlength="80" value="' + esc(defaultName) + '" placeholder="Mitarbeitername">' +
            '</div>' +
          '</div>' +

          '<div class="form-field">' +
            '<label class="kicker">2. Art (Standard: Gäste im Haus)</label>' +
            '<div id="opsRekArtGroup" class="ops-choice-group"></div>' +
          '</div>' +

          '<div class="form-field">' +
            '<label class="kicker">3. Bereich</label>' +
            '<div id="opsRekBereichGroup" class="ops-choice-group"></div>' +
          '</div>' +

          '<div class="form-field">' +
            '<label class="kicker" for="opsRekBemerkung">4. Bemerkung / Ablauf &amp; Maßnahme</label>' +
            '<textarea id="opsRekBemerkung" class="input-control ops-textarea" rows="4" maxlength="2000" placeholder="z. B. T23: Gericht zu trocken / Wartezeit – entschuldigt, Küche informiert, Getränk aufs Haus …"></textarea>' +
          '</div>' +

          '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">' +
            '<span class="kicker" style="text-transform:none;letter-spacing:0.02em;">Wird direkt im passenden Monatsblatt (Spalten Datum, Art, Bereich, Bemerkung, Name) gespeichert.</span>' +
            '<button type="button" id="btnSaveReklamation" class="btn btn-primary">Reklamation speichern</button>' +
          '</div>' +
        '</div>' +

        '<div class="card">' +
          '<div class="card-head">' +
            '<div>' +
              '<div class="kicker">Live-Protokoll</div>' +
              '<h3 id="opsRekRecentTitle">Letzte Einträge – ' + esc(res.sheetName) + '</h3>' +
            '</div>' +
          '</div>' +
          '<div class="table-wrap"><table><thead><tr>' +
            '<th>Datum</th><th>Art</th><th>Bereich</th><th>Bemerkung</th><th>Name</th>' +
          '</tr></thead><tbody id="opsRekRecentBody"></tbody></table></div>' +
        '</div>';

      renderReklamationChoices('opsRekArtGroup', res.artOptions || [], OPS_STATE.selectedArt, function(val) {
        OPS_STATE.selectedArt = val;
      });
      renderReklamationChoices('opsRekBereichGroup', res.bereichOptions || [], OPS_STATE.selectedBereich, function(val) {
        OPS_STATE.selectedBereich = val;
      });
      renderReklamationRecentTable(res);

      const monthSel = document.getElementById('opsRekMonthSelect');
      if (monthSel) {
        monthSel.addEventListener('change', function() {
          OPS_STATE.selectedMonth = monthSel.value;
          loadReklamationTab(session, monthSel.value);
        });
      }
      const reloadBtn = document.getElementById('btnReloadReklamation');
      if (reloadBtn) {
        reloadBtn.addEventListener('click', function() {
          loadReklamationTab(session, OPS_STATE.selectedMonth);
        });
      }

      const saveFn = async function() {
        const errEl = document.getElementById('opsRekError');
        const okEl = document.getElementById('opsRekSuccess');
        const showMsg = function(errMsg, okMsg) {
          if (errEl) {
            errEl.textContent = errMsg || '';
            errEl.classList.toggle('hidden', !errMsg);
          }
          if (okEl) {
            okEl.textContent = okMsg || '';
            okEl.classList.toggle('hidden', !okMsg);
          }
        };

        const dateVal = (document.getElementById('opsRekDate') && document.getElementById('opsRekDate').value) || todayIsoLocal();
        const nameVal = (document.getElementById('opsRekName') && document.getElementById('opsRekName').value || '').trim();
        const bemVal = (document.getElementById('opsRekBemerkung') && document.getElementById('opsRekBemerkung').value || '').trim();

        if (!OPS_STATE.selectedArt) {
          showMsg('Bitte eine Art auswählen.', '');
          return;
        }
        if (!OPS_STATE.selectedBereich) {
          showMsg('Bitte einen Bereich auswählen.', '');
          return;
        }
        if (bemVal.length < 3) {
          showMsg('Bitte eine Bemerkung eingeben (mind. 3 Zeichen).', '');
          return;
        }
        if (!nameVal) {
          showMsg('Bitte deinen Namen angeben.', '');
          return;
        }

        const btn = document.getElementById('btnSaveReklamation');
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Speichert…';
        }
        showMsg('', '');

        try {
          const saveRes = await window.SonaApi.saveOpsReklamation(session.standortId, {
            date: dateVal,
            art: OPS_STATE.selectedArt,
            bereich: OPS_STATE.selectedBereich,
            bemerkung: bemVal,
            name: nameVal
          });
          if (!saveRes || !saveRes.success) {
            showMsg((saveRes && saveRes.error) || 'Speichern fehlgeschlagen.', '');
            return;
          }
          saveOpsName(session, nameVal);
          const bemInput = document.getElementById('opsRekBemerkung');
          if (bemInput) bemInput.value = '';

          showMsg('', 'Gespeichert im Blatt „' + saveRes.sheetName + '“ (Zeile ' + saveRes.rowNumber + ').');
          if (window.SonaApp && window.SonaApp.toast) {
            window.SonaApp.toast('Gäste-Reklamation gespeichert (' + saveRes.sheetName + ').');
          }

          // Liste direkt aktualisieren
          const fresh = await window.SonaApi.getOpsReklamationMeta(session.standortId, saveRes.sheetName);
          if (fresh && fresh.success && fresh.status === 'AKTIV') {
            OPS_STATE.meta = fresh;
            OPS_STATE.selectedMonth = fresh.sheetName;
            if (monthSel && fresh.sheetName) monthSel.value = fresh.sheetName;
            renderReklamationRecentTable(fresh);
          }
        } catch (err) {
          showMsg('Verbindungsfehler: ' + (err && err.message ? err.message : String(err)), '');
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Reklamation speichern';
          }
        }
      };

      const saveBtn = document.getElementById('btnSaveReklamation');
      if (saveBtn) saveBtn.addEventListener('click', saveFn);

      const bemEl = document.getElementById('opsRekBemerkung');
      if (bemEl) {
        bemEl.addEventListener('keydown', function(ev) {
          if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
            ev.preventDefault();
            saveFn();
          }
        });
      }
    } catch (err) {
      const currentPane = document.getElementById('opsTabPane');
      if (!currentPane) return;
      currentPane.innerHTML =
        '<div class="card">' +
          '<div class="kicker">Gäste-Reklamation</div>' +
          '<p class="module-desc">Verbindungsfehler: ' + esc(err && err.message ? err.message : String(err)) + '</p>' +
        '</div>';
    }
  }

  window.SonaOperationsModule = {
    openExternalTab: openExternalTab,
    mount: function(session, mod) {
      const container = document.getElementById('osMainContent');
      if (!container) return;

      const rawSchwundUrl = (mod && mod.schwundUrl) || '';
      const rawBruchUrl = (mod && mod.bruchUrl) || '';
      const userName = getSavedOpsName(session);
      const appendUserParam = function(u) {
        if (!u || !userName) return u;
        return u + (u.indexOf('?') === -1 ? '?' : '&') + 'user=' + encodeURIComponent(userName);
      };
      const schwundUrl = appendUserParam(rawSchwundUrl);
      const bruchUrl = appendUserParam(rawBruchUrl);

      const perms = (session && session.permissions) || {};
      const accessLevel = String(perms.accessLevel || 'READ').toUpperCase();
      const opTabs = (perms.tabPermissions && perms.tabPermissions.operations !== undefined)
        ? perms.tabPermissions.operations
        : 'ALL';

      const canReklamation = (opTabs === 'ALL') || (Array.isArray(opTabs) && opTabs.indexOf('reklamation') !== -1);
      const canSchwundInput = (opTabs === 'ALL') || (Array.isArray(opTabs) && opTabs.indexOf('schwund_eingabe') !== -1);
      const canBruchInput = (opTabs === 'ALL') || (Array.isArray(opTabs) && opTabs.indexOf('bruch_eingabe') !== -1);
      const canSchwundStats = (opTabs === 'ALL' && (accessLevel === 'WRITE' || accessLevel === 'ADMIN' || !!perms.adminMatrix))
        || (Array.isArray(opTabs) && opTabs.indexOf('schwund_auswertung') !== -1);
      const hasBestandAccess = !!(perms.modules && perms.modules.bestand);

      const tabs = [];
      if (canReklamation) tabs.push({ id: 'reklamation', label: 'Gäste-Reklamation' });
      if (canSchwundInput || canBruchInput) tabs.push({ id: 'inputs', label: 'Schwund & Bruch' });
      if (canSchwundStats) tabs.push({ id: 'stats', label: 'Schwund-Auswertung' });

      if (!tabs.some(function(t) { return t.id === OPS_STATE.activeTab; })) {
        OPS_STATE.activeTab = tabs.length ? tabs[0].id : '';
      }

      const renderActiveOpsTab = function() {
        container.querySelectorAll('.ops-subtab-btn').forEach(function(btn) {
          btn.classList.toggle('active', btn.dataset.opstab === OPS_STATE.activeTab);
        });
        const pane = document.getElementById('opsTabPane');
        if (!pane) return;

        if (OPS_STATE.activeTab === 'reklamation') {
          loadReklamationTab(session, OPS_STATE.selectedMonth);
          return;
        }

        if (OPS_STATE.activeTab === 'inputs') {
          let inputCardsHtml = '';
          if (canSchwundInput) {
            inputCardsHtml +=
              '<div class="module-card">' +
                '<div>' +
                  '<div class="kicker">Tagesbetrieb · Separater Tab</div>' +
                  '<h3>Schwund-Erfassung</h3>' +
                  '<p class="module-desc">Tagesaktuelle Erfassung von Verderb, Überproduktion &amp; Küchen-/Bar-Schwund. Dein Profilname wird automatisch vorbelegt.</p>' +
                '</div>' +
                '<div>' +
                  (schwundUrl
                    ? '<a class="btn btn-primary btn-sm" href="' + esc(schwundUrl) + '" target="_blank" rel="noopener noreferrer" onclick="window.open(this.href, \'_blank\', \'noopener,noreferrer\'); return false;">Im neuen Tab öffnen ↗</a>'
                    : '<span class="badge">URL nicht hinterlegt</span>') +
                  '<div style="margin-top:8px;font-size:11px;color:var(--os-silk);">Öffnet sich im eigenen Browser-Tab – SONA OS bleibt offen.</div>' +
                '</div>' +
              '</div>';
          }
          if (canBruchInput) {
            inputCardsHtml +=
              '<div class="module-card">' +
                '<div>' +
                  '<div class="kicker">Tagesbetrieb · Separater Tab</div>' +
                  '<h3>Bruch-Erfassung</h3>' +
                  '<p class="module-desc">Schnelle Erfassung von Glas-, Geschirr- und Flaschenbruch im laufenden Service. Dein Profilname wird automatisch vorbelegt.</p>' +
                '</div>' +
                '<div>' +
                  (bruchUrl
                    ? '<a class="btn btn-primary btn-sm" href="' + esc(bruchUrl) + '" target="_blank" rel="noopener noreferrer" onclick="window.open(this.href, \'_blank\', \'noopener,noreferrer\'); return false;">Im neuen Tab öffnen ↗</a>'
                    : '<span class="badge">URL nicht hinterlegt</span>') +
                  '<div style="margin-top:8px;font-size:11px;color:var(--os-silk);">Öffnet sich im eigenen Browser-Tab – SONA OS bleibt offen.</div>' +
                '</div>' +
              '</div>';
          }

          pane.innerHTML =
            '<div class="pillar-section"><div class="grid-2">' + inputCardsHtml + '</div></div>' +
            '<div class="pillar-section">' +
              '<div class="pillar-head"><h3>Weitere Operations-Bausteine (geplant)</h3></div>' +
              '<div class="grid-2">' +
                '<div class="module-card"><div><div class="kicker">In Vorbereitung</div><h3>Gästebewertungen</h3><p class="module-desc">Zentrale Übersicht für Google-, Lieferando- und direkte Gäste-Bewertungen je Standort.</p></div><div><span class="badge">Vorbereitet</span></div></div>' +
                '<div class="module-card"><div><div class="kicker">In Vorbereitung</div><h3>Checklisten &amp; Übergabe</h3><p class="module-desc">Öffnungs-, Schicht- und Schließchecklisten für Küche, Bar und Service.</p></div><div><span class="badge">Vorbereitet</span></div></div>' +
              '</div>' +
            '</div>';
          return;
        }

        if (OPS_STATE.activeTab === 'stats') {
          if (hasBestandAccess) {
            pane.innerHTML = '<div id="opsSchwundKpiSlot"></div>';
            loadSchwundOverview(session);
          } else {
            pane.innerHTML =
              '<div class="card">' +
                '<div class="kicker">Schwund-Kennzahlen</div>' +
                '<h3>Bestand-Leserecht erforderlich</h3>' +
                '<p class="module-desc">Aktiviere für diesen Benutzer in der Rechte-Matrix zusätzlich das Modul <b>Bestand</b>, damit die Live-Periodenzahlen und Top-Positionen hier direkt angezeigt werden.</p>' +
              '</div>';
          }
          return;
        }

        pane.innerHTML = '<div class="card"><p class="module-desc">Für deinen Zugang sind in Operations aktuell keine Tabs freigeschaltet.</p></div>';
      };

      container.innerHTML =
        '<div class="bv-subtabs">' +
          tabs.map(function(t) {
            return '<button type="button" class="bv-tab-btn ops-subtab-btn' + (t.id === OPS_STATE.activeTab ? ' active' : '') + '" data-opstab="' + esc(t.id) + '">' + esc(t.label) + '</button>';
          }).join('') +
        '</div>' +
        '<div id="opsTabPane"></div>';

      container.querySelectorAll('.ops-subtab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          OPS_STATE.activeTab = btn.dataset.opstab;
          renderActiveOpsTab();
        });
      });

      renderActiveOpsTab();
    }
  };
})();
