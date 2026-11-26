'use strict';

(function() {
  const OPS_STATE = {
    activeTab: 'reklamation',
    selectedMonth: '',
    selectedPeriod: '',
    selectedTodoDate: '',
    selectedPutzplanDate: '',
    ratingSubTab: 'staff',
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

  function renderBreakdownRows(items, showPieces) {
    if (!items || !items.length) {
      return '<tr><td colspan="' + (showPieces ? 5 : 4) + '">Keine Einträge in dieser Periode.</td></tr>';
    }
    return items.map(function(it) {
      return '<tr>' +
        '<td><b>' + esc(it.label || '–') + '</b></td>' +
        '<td class="tabular">' + fmtEur(it.eur) + '</td>' +
        '<td class="tabular">' + fmtNum(it.sharePct, 1) + ' %</td>' +
        (showPieces ? '<td class="tabular">' + fmtNum(it.pieces || 0, 0) + ' Stk</td>' : '') +
        '<td class="tabular">' + esc(it.count || 0) + '</td>' +
      '</tr>';
    }).join('');
  }

  async function loadMonthlySummary(session, forceRefresh, periodKey, targetEl) {
    const slot = targetEl || document.getElementById('opsSchwundKpiSlot');
    if (!slot) return;
    const chosenPeriod = periodKey !== undefined ? periodKey : (OPS_STATE.selectedPeriod || '');
    slot.innerHTML =
      '<div class="card">' +
        '<div class="kicker">Schwund- &amp; Bruch-Auswertung · ' + esc(session.standortName) + '</div>' +
        '<p class="module-desc">Lade Auswertung …</p>' +
      '</div>';

    try {
      const res = await window.SonaApi.getOpsMonthlySummary(session.standortId, !!forceRefresh, chosenPeriod);
      const currentSlot = targetEl || document.getElementById('opsSchwundKpiSlot');
      if (!currentSlot || !document.body.contains(currentSlot)) return;

      if (!res || res.success === false) {
        currentSlot.innerHTML =
          '<div class="card">' +
            '<div class="kicker">Schwund- &amp; Bruch-Auswertung</div>' +
            '<h3>Auswertung konnte nicht geladen werden</h3>' +
            '<p class="module-desc">' + esc((res && res.error) || 'Unbekannter Fehler.') + '</p>' +
          '</div>';
        return;
      }

      if (res.status === 'IN_VORBEREITUNG') {
        currentSlot.innerHTML =
          '<div class="card">' +
            '<div class="kicker">Schwund- &amp; Bruch-Auswertung · ' + esc(session.standortName) + '</div>' +
            '<h3>Noch nicht für diesen Standort verknüpft</h3>' +
            '<p class="module-desc">' + esc(res.message || 'Für diesen Standort sind noch keine Schwund- und Bruch-Tabellen hinterlegt.') + '</p>' +
          '</div>';
        return;
      }

      OPS_STATE.selectedPeriod = res.periodKey || chosenPeriod || '';
      const monthLabel = res.monthLabel || 'Aktuelle Periode';
      const periods = Array.isArray(res.availablePeriods) ? res.availablePeriods : [];
      const schwund = res.schwund || { totalEur: 0, count: 0, byStation: [], byVerschulden: [], byReason: [] };
      const bruch = res.bruch || { totalEur: 0, pieces: 0, count: 0, byStation: [], byVerschulden: [] };
      const totalLossEur = Math.round(((Number(schwund.totalEur) || 0) + (Number(bruch.totalEur) || 0)) * 100) / 100;

      currentSlot.innerHTML =
        '<div class="card" style="margin-bottom:16px;">' +
          '<div class="card-head">' +
            '<div>' +
              '<div class="kicker">Operations · Auswertung (' + esc(session.standortName) + ')</div>' +
              '<h3>Schwund- &amp; Bruch-Auswertung · ' + esc(monthLabel) + '</h3>' +
            '</div>' +
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
              '<select id="opsStatsPeriodSelect" class="input-control" style="height:32px;width:auto;min-width:170px;">' +
                periods.map(function(p) {
                  return '<option value="' + esc(p.key) + '"' + (p.key === res.periodKey ? ' selected' : '') + '>' + esc(p.label) + '</option>';
                }).join('') +
              '</select>' +
              '<button type="button" id="btnReloadOpsSummary" class="btn btn-sm">Aktualisieren</button>' +
            '</div>' +
          '</div>' +
          '<div class="grid-4">' +
            '<div class="bv-kpi-card">' +
              '<div class="kicker">Monatsschwund (Netto)</div>' +
              '<div class="bv-kpi-val tabular">' + fmtEur(schwund.totalEur) + '</div>' +
              '<div style="margin-top:6px;font-size:12px;color:var(--os-silk);">' + esc(schwund.count || 0) + ' Buchungen</div>' +
            '</div>' +
            '<div class="bv-kpi-card">' +
              '<div class="kicker">Monatsbruch (Netto)</div>' +
              '<div class="bv-kpi-val tabular">' + fmtEur(bruch.totalEur) + '</div>' +
              '<div style="margin-top:6px;font-size:12px;color:var(--os-silk);">' + fmtNum(bruch.pieces || 0, 0) + ' Stück · ' + esc(bruch.count || 0) + ' Buchungen</div>' +
            '</div>' +
            '<div class="bv-kpi-card">' +
              '<div class="kicker">Bruchstücke gesamt</div>' +
              '<div class="bv-kpi-val tabular">' + fmtNum(bruch.pieces || 0, 0) + ' Stk</div>' +
              '<div style="margin-top:6px;font-size:12px;color:var(--os-silk);">aus BRUCH_NEU</div>' +
            '</div>' +
            '<div class="bv-kpi-card">' +
              '<div class="kicker">Gesamtverlust Schwund + Bruch</div>' +
              '<div class="bv-kpi-val tabular">' + fmtEur(totalLossEur) + '</div>' +
              '<div style="margin-top:6px;font-size:12px;color:var(--os-silk);">' + esc((schwund.count || 0) + (bruch.count || 0)) + ' Meldungen</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="grid-2" style="margin-bottom:16px;">' +
          '<div class="card">' +
            '<div class="card-head"><div><div class="kicker">Schwund-Auswertung</div><h3>Schwund nach Bereich / Station</h3></div></div>' +
            '<div class="table-wrap"><table><thead><tr><th>Station</th><th>Verlust (Netto)</th><th>Anteil</th><th>Buchungen</th></tr></thead><tbody>' +
              renderBreakdownRows(schwund.byStation, false) +
            '</tbody></table></div>' +
          '</div>' +
          '<div class="card">' +
            '<div class="card-head"><div><div class="kicker">Schwund-Auswertung</div><h3>Schwund nach Verschulden</h3></div></div>' +
            '<div class="table-wrap"><table><thead><tr><th>Verschuldensart</th><th>Verlust (Netto)</th><th>Anteil</th><th>Buchungen</th></tr></thead><tbody>' +
              renderBreakdownRows(schwund.byVerschulden, false) +
            '</tbody></table></div>' +
          '</div>' +
        '</div>' +

        '<div class="grid-2" style="margin-bottom:16px;">' +
          '<div class="card">' +
            '<div class="card-head"><div><div class="kicker">Bruch-Auswertung</div><h3>Bruch nach Station / Bereich</h3></div></div>' +
            '<div class="table-wrap"><table><thead><tr><th>Bereich</th><th>Bruchwert (Netto)</th><th>Anteil</th><th>Menge</th><th>Buchungen</th></tr></thead><tbody>' +
              renderBreakdownRows(bruch.byStation, true) +
            '</tbody></table></div>' +
          '</div>' +
          '<div class="card">' +
            '<div class="card-head"><div><div class="kicker">Bruch-Auswertung</div><h3>Bruch nach Verschulden / Verursacher</h3></div></div>' +
            '<div class="table-wrap"><table><thead><tr><th>Verschuldensart</th><th>Bruchwert (Netto)</th><th>Anteil</th><th>Menge</th><th>Buchungen</th></tr></thead><tbody>' +
              renderBreakdownRows(bruch.byVerschulden, true) +
            '</tbody></table></div>' +
          '</div>' +
        '</div>' +

        '<div class="card">' +
          '<div class="card-head"><div><div class="kicker">Schwund-Auswertung</div><h3>Top Verlustgründe (SCHWUND_NEU)</h3></div></div>' +
          '<div class="table-wrap"><table><thead><tr><th>Verlustgrund</th><th>Verlust (Netto)</th><th>Anteil</th><th>Buchungen</th></tr></thead><tbody>' +
            renderBreakdownRows(schwund.byReason, false) +
          '</tbody></table></div>' +
        '</div>';

      const periodSel = currentSlot.querySelector('#opsStatsPeriodSelect');
      if (periodSel) {
        periodSel.addEventListener('change', function() {
          OPS_STATE.selectedPeriod = periodSel.value;
          loadMonthlySummary(session, false, periodSel.value, currentSlot);
        });
      }
      const reloadBtn = currentSlot.querySelector('#btnReloadOpsSummary');
      if (reloadBtn) {
        reloadBtn.addEventListener('click', function() {
          loadMonthlySummary(session, true, OPS_STATE.selectedPeriod, currentSlot);
        });
      }
    } catch (err) {
      const currentSlot = targetEl || document.getElementById('opsSchwundKpiSlot');
      if (!currentSlot) return;
      currentSlot.innerHTML =
        '<div class="card">' +
          '<div class="kicker">Schwund- &amp; Bruch-Auswertung</div>' +
          '<p class="module-desc">Fehler beim Laden: ' + esc(err && err.message ? err.message : String(err)) + '</p>' +
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
              '<div class="kicker">Operations · ' + esc(session.standortName) + '</div>' +
              '<h3>Reklamation und Beschwerden</h3>' +
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

          '<div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;flex-wrap:wrap;">' +
            '<button type="button" id="btnSaveReklamation" class="btn btn-primary">Eintrag speichern</button>' +
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

  const STAR_BY_NUM = [
    '☆☆☆☆☆ (0)',
    '★☆☆☆☆ (1)',
    '★★☆☆☆ (2)',
    '★★★☆☆ (3)',
    '★★★★☆ (4)',
    '★★★★★ (5)'
  ];

  function starToNum(starVal) {
    const s = String(starVal || '');
    const m = s.match(/\((\d)\)/);
    if (m) return Math.max(0, Math.min(5, parseInt(m[1], 10)));
    return 2;
  }

  function calcClientAvgScore(stars, isAw) {
    if (isAw) return '-';
    let sum = 0;
    let cnt = 0;
    (stars || []).forEach(function(s) {
      const str = String(s || '');
      if (!str || str.toLowerCase().indexOf('außer') !== -1 || str.toLowerCase().indexOf('ausser') !== -1) return;
      const m = str.match(/\((\d)\)/);
      if (m) {
        sum += parseInt(m[1], 10);
        cnt++;
      }
    });
    return cnt ? (sum / cnt).toFixed(1) : '-';
  }

  function renderSliderCell(val, cIdx, disabledAttr) {
    const num = starToNum(val);
    return '<td class="ops-slider-cell">' +
      '<div class="ops-slider-wrap">' +
        '<input type="range" class="ops-slider" min="0" max="5" step="1" value="' + num + '" data-crit-idx="' + cIdx + '"' + disabledAttr + '>' +
        '<span class="ops-slider-val tabular">' + num + '★</span>' +
      '</div>' +
    '</td>';
  }

  async function loadRatingTab(session) {
    const pane = document.getElementById('opsTabPane');
    if (!pane) return;

    pane.innerHTML =
      '<div class="card">' +
        '<div class="kicker">Mitarbeiter Ranking · ' + esc(session.standortName) + '</div>' +
        '<p class="module-desc">Lade Tabelle aus SONA HUB …</p>' +
      '</div>';

    try {
      const res = await window.SonaApi.getOpsRatingMeta(session.standortId);
      if (!document.getElementById('opsTabPane')) return;

      if (!res || !res.success) {
        pane.innerHTML =
          '<div class="card">' +
            '<div class="kicker">Mitarbeiter Ranking</div>' +
            '<h3>Tabelle konnte nicht geladen werden</h3>' +
            '<p class="module-desc">' + esc((res && res.error) || 'Unbekannter Fehler.') + '</p>' +
          '</div>';
        return;
      }

      if (res.status === 'IN_VORBEREITUNG') {
        pane.innerHTML =
          '<div class="card">' +
            '<div class="kicker">Mitarbeiter Ranking · ' + esc(session.standortName) + '</div>' +
            '<h3>Noch nicht für diesen Standort verknüpft</h3>' +
            '<p class="module-desc">' + esc(res.message || 'Für diesen Standort ist noch kein SONA HUB hinterlegt.') + '</p>' +
          '</div>';
        return;
      }

      const staffCriteria = Array.isArray(res.staffCriteria) ? res.staffCriteria : ['Fach/Service', 'Zuverl.', 'Team', 'Fleiß'];
      const azubiCriteria = Array.isArray(res.azubiCriteria) ? res.azubiCriteria : ['Zuverl.', 'Fleiß', 'Service', 'Sprache'];
      const azubiStatuses = Array.isArray(res.azubiStatusOptions) ? res.azubiStatusOptions : ['Vollstaendig', 'Rueckstand', 'Fehlt'];
      const staffList = Array.isArray(res.staff) ? res.staff : [];
      const azubiList = Array.isArray(res.azubis) ? res.azubis : [];
      const disabledAttr = res.canWrite ? '' : ' disabled';
      const dirtyMap = {};
      let showAddForm = false;

      const updateSaveButtonLabel = function() {
        const btn = document.getElementById('btnSaveAllRatings');
        if (!btn) return;
        const count = Object.keys(dirtyMap).length;
        btn.textContent = count > 0 ? ('Änderungen speichern & Sync (' + count + ')') : 'Speichern & Sync';
        btn.disabled = !res.canWrite || count === 0;
      };

      const renderRatingBody = function() {
        const isStaff = OPS_STATE.ratingSubTab !== 'azubi';
        const list = isStaff ? staffList : azubiList;
        const criteria = isStaff ? staffCriteria : azubiCriteria;
        const typeKey = isStaff ? 'staff' : 'azubi';

        const addFormHtml = (res.canWrite && showAddForm)
          ? '<div class="ops-add-member-bar">' +
              '<input type="text" id="opsAddMemberName" class="input-control" style="height:32px;max-width:200px;" maxlength="80" placeholder="' + (isStaff ? 'Name Mitarbeiter' : 'Name Azubi') + '">' +
              '<select id="opsAddMemberDept" class="input-control" style="height:32px;width:auto;">' +
                '<option value="Service">Service</option>' +
                '<option value="Kueche">Küche</option>' +
                '<option value="Bar">Bar</option>' +
              '</select>' +
              (!isStaff
                ? '<select id="opsAddAzubiStatus" class="input-control" style="height:32px;width:auto;">' +
                    azubiStatuses.map(function(st) { return '<option value="' + esc(st) + '">' + esc(st) + '</option>'; }).join('') +
                  '</select>'
                : '') +
              '<button type="button" id="btnConfirmAddMember" class="btn btn-primary btn-sm">Anlegen</button>' +
              '<button type="button" id="btnCancelAddMember" class="btn btn-sm">Abbrechen</button>' +
            '</div>'
          : '';

        let tableHtml = '';
        if (isStaff) {
          const rowsHtml = list.length
            ? list.map(function(item, idx) {
                const key = 'staff_' + item.row;
                const dirtyCls = dirtyMap[key] ? ' is-dirty' : '';
                return '<tr class="ops-rating-row' + dirtyCls + '" data-type="staff" data-idx="' + idx + '" data-row="' + esc(item.row) + '">' +
                  '<td style="white-space:nowrap;">' + esc(item.dept || 'Service') + '</td>' +
                  '<td style="white-space:nowrap;"><b>' + esc(item.name) + '</b></td>' +
                  renderSliderCell(item.stars[0], 0, disabledAttr) +
                  renderSliderCell(item.stars[1], 1, disabledAttr) +
                  renderSliderCell(item.stars[2], 2, disabledAttr) +
                  renderSliderCell(item.stars[3], 3, disabledAttr) +
                  '<td class="tabular"><span class="badge ops-row-score">' + esc(item.score || '-') + '</span></td>' +
                  '<td><input type="text" class="input-control ops-rating-inline-input ops-rating-notes" maxlength="2000" value="' + esc(item.notes || '') + '" placeholder="Notiz …"' + disabledAttr + '></td>' +
                  '<td class="chk-cell"><input type="checkbox" class="ops-rating-aw"' + (item.isAw ? ' checked' : '') + disabledAttr + ' title="Außer Wertung"></td>' +
                '</tr>';
              }).join('')
            : '<tr><td colspan="9">Keine Mitarbeiter vorhanden.</td></tr>';

          tableHtml =
            '<div class="table-wrap"><table class="ops-rating-table"><thead><tr>' +
              '<th>Bereich</th><th>Mitarbeiter</th>' +
              criteria.map(function(c) { return '<th>' + esc(c) + '</th>'; }).join('') +
              '<th>Ø</th><th>Notizen</th><th>A.W.</th>' +
            '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
        } else {
          const rowsHtml = list.length
            ? list.map(function(item, idx) {
                const key = 'azubi_' + item.row;
                const dirtyCls = dirtyMap[key] ? ' is-dirty' : '';
                return '<tr class="ops-rating-row' + dirtyCls + '" data-type="azubi" data-idx="' + idx + '" data-row="' + esc(item.row) + '">' +
                  '<td style="white-space:nowrap;"><b>' + esc(item.name) + '</b></td>' +
                  '<td style="white-space:nowrap;">' + esc(item.dept || 'Service') + '</td>' +
                  '<td><select class="input-control ops-rating-status" style="height:30px;padding:2px 6px;font-size:11px;"' + disabledAttr + '>' +
                    azubiStatuses.map(function(st) {
                      return '<option value="' + esc(st) + '"' + (st === item.status ? ' selected' : '') + '>' + esc(st) + '</option>';
                    }).join('') +
                  '</select></td>' +
                  renderSliderCell(item.stars[0], 0, disabledAttr) +
                  renderSliderCell(item.stars[1], 1, disabledAttr) +
                  renderSliderCell(item.stars[2], 2, disabledAttr) +
                  renderSliderCell(item.stars[3], 3, disabledAttr) +
                  '<td class="tabular"><span class="badge ops-row-score">' + esc(item.score || '-') + '</span></td>' +
                  '<td><input type="text" class="input-control ops-rating-inline-input ops-rating-feedback" maxlength="2000" value="' + esc(item.feedback || '') + '" placeholder="Feedback …"' + disabledAttr + '></td>' +
                  '<td><input type="text" class="input-control ops-rating-inline-input ops-rating-todo" maxlength="2000" value="' + esc(item.todo || '') + '" placeholder="To-Dos …"' + disabledAttr + '></td>' +
                '</tr>';
              }).join('')
            : '<tr><td colspan="10">Keine Azubis vorhanden.</td></tr>';

          tableHtml =
            '<div class="table-wrap"><table class="ops-rating-table"><thead><tr>' +
              '<th>Azubi</th><th>Abt.</th><th>Berichtsheft</th>' +
              criteria.map(function(c) { return '<th>' + esc(c) + '</th>'; }).join('') +
              '<th>Ø</th><th>Feedback</th><th>To-Dos</th>' +
            '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
        }

        pane.innerHTML =
          '<div class="card">' +
            '<div class="card-head">' +
              '<div>' +
                '<div class="kicker">' + esc(res.kwBanner || ('Mitarbeiter Ranking · ' + session.standortName)) + '</div>' +
                '<h3>' + esc(isStaff ? 'Personal Scorecard' : 'Azubi-Entwicklung') + '</h3>' +
              '</div>' +
              '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
                '<button type="button" id="btnRatingSubStaff" class="bv-tab-btn' + (isStaff ? ' active' : '') + '">Personal (' + esc(staffList.length) + ')</button>' +
                '<button type="button" id="btnRatingSubAzubi" class="bv-tab-btn' + (!isStaff ? ' active' : '') + '">Azubis (' + esc(azubiList.length) + ')</button>' +
                (res.canWrite ? '<button type="button" id="btnToggleAddMember" class="btn btn-sm">+ ' + (isStaff ? 'Mitarbeiter' : 'Azubi') + '</button>' : '') +
                (res.canWrite ? '<button type="button" id="btnSaveAllRatings" class="btn btn-primary btn-sm">Speichern &amp; Sync</button>' : '') +
                '<button type="button" id="btnReloadRatings" class="btn btn-sm">Neu laden</button>' +
              '</div>' +
            '</div>' +
            addFormHtml +
            '<div id="opsRatingMsg" style="margin-bottom:10px;font-size:12px;"></div>' +
            tableHtml +
          '</div>';

        updateSaveButtonLabel();

        const btnStaff = document.getElementById('btnRatingSubStaff');
        const btnAzubi = document.getElementById('btnRatingSubAzubi');
        const btnReload = document.getElementById('btnReloadRatings');
        const btnToggleAdd = document.getElementById('btnToggleAddMember');
        if (btnStaff) btnStaff.addEventListener('click', function() { OPS_STATE.ratingSubTab = 'staff'; showAddForm = false; renderRatingBody(); });
        if (btnAzubi) btnAzubi.addEventListener('click', function() { OPS_STATE.ratingSubTab = 'azubi'; showAddForm = false; renderRatingBody(); });
        if (btnReload) btnReload.addEventListener('click', function() { loadRatingTab(session); });
        if (btnToggleAdd) btnToggleAdd.addEventListener('click', function() { showAddForm = !showAddForm; renderRatingBody(); });

        const btnCancelAdd = document.getElementById('btnCancelAddMember');
        if (btnCancelAdd) btnCancelAdd.addEventListener('click', function() { showAddForm = false; renderRatingBody(); });

        const btnConfirmAdd = document.getElementById('btnConfirmAddMember');
        if (btnConfirmAdd) {
          btnConfirmAdd.addEventListener('click', async function() {
            const nameInput = document.getElementById('opsAddMemberName');
            const deptSelect = document.getElementById('opsAddMemberDept');
            const statusSelect = document.getElementById('opsAddAzubiStatus');
            const msgEl = document.getElementById('opsRatingMsg');
            const cleanName = nameInput ? nameInput.value.trim() : '';
            if (cleanName.length < 2) {
              if (msgEl) { msgEl.style.color = '#f87171'; msgEl.textContent = 'Bitte einen Namen eingeben (mind. 2 Zeichen).'; }
              return;
            }
            btnConfirmAdd.disabled = true;
            btnConfirmAdd.textContent = 'Legt an…';
            try {
              const addRes = await window.SonaApi.addOpsRatingMember(session.standortId, {
                type: typeKey,
                name: cleanName,
                dept: deptSelect ? deptSelect.value : 'Service',
                status: statusSelect ? statusSelect.value : 'Vollstaendig'
              });
              if (!addRes || !addRes.success) {
                if (msgEl) { msgEl.style.color = '#f87171'; msgEl.textContent = (addRes && addRes.error) || 'Anlegen fehlgeschlagen.'; }
                return;
              }
              if (isStaff && addRes.member) staffList.push(addRes.member);
              if (!isStaff && addRes.member) azubiList.push(addRes.member);
              showAddForm = false;
              renderRatingBody();
              if (window.SonaApp && window.SonaApp.toast) {
                window.SonaApp.toast(cleanName + ' angelegt und mit SONA HUB synchronisiert.');
              }
            } catch (eAdd) {
              if (msgEl) { msgEl.style.color = '#f87171'; msgEl.textContent = 'Verbindungsfehler: ' + (eAdd && eAdd.message ? eAdd.message : String(eAdd)); }
            } finally {
              btnConfirmAdd.disabled = false;
              btnConfirmAdd.textContent = 'Anlegen';
            }
          });
        }

        pane.querySelectorAll('.ops-rating-row').forEach(function(tr) {
          const idx = parseInt(tr.dataset.idx, 10);
          const item = list[idx];
          if (!item) return;
          const rowKey = typeKey + '_' + item.row;

          const markDirty = function() {
            dirtyMap[rowKey] = { type: typeKey, item: item };
            tr.classList.add('is-dirty');
            const scoreBadge = tr.querySelector('.ops-row-score');
            if (scoreBadge) {
              item.score = calcClientAvgScore(item.stars, !!item.isAw);
              scoreBadge.textContent = item.score;
            }
            updateSaveButtonLabel();
          };

          tr.querySelectorAll('.ops-slider').forEach(function(slider) {
            slider.addEventListener('input', function() {
              const cIdx = parseInt(slider.dataset.critIdx, 10);
              const valNum = parseInt(slider.value, 10);
              item.stars[cIdx] = STAR_BY_NUM[valNum] || '★★☆☆☆ (2)';
              const valSpan = slider.parentNode && slider.parentNode.querySelector('.ops-slider-val');
              if (valSpan) valSpan.textContent = valNum + '★';
              const awBox = tr.querySelector('.ops-rating-aw');
              if (awBox && awBox.checked) {
                awBox.checked = false;
                item.isAw = false;
              }
              markDirty();
            });
          });

          const awBox = tr.querySelector('.ops-rating-aw');
          if (awBox) {
            awBox.addEventListener('change', function() {
              item.isAw = !!awBox.checked;
              markDirty();
            });
          }

          const notesEl = tr.querySelector('.ops-rating-notes');
          if (notesEl) {
            notesEl.addEventListener('input', function() {
              item.notes = notesEl.value;
              markDirty();
            });
          }

          const statusEl = tr.querySelector('.ops-rating-status');
          if (statusEl) {
            statusEl.addEventListener('change', function() {
              item.status = statusEl.value;
              markDirty();
            });
          }

          const fbEl = tr.querySelector('.ops-rating-feedback');
          if (fbEl) {
            fbEl.addEventListener('input', function() {
              item.feedback = fbEl.value;
              markDirty();
            });
          }

          const todoEl = tr.querySelector('.ops-rating-todo');
          if (todoEl) {
            todoEl.addEventListener('input', function() {
              item.todo = todoEl.value;
              markDirty();
            });
          }
        });

        const btnSaveAll = document.getElementById('btnSaveAllRatings');
        if (btnSaveAll) {
          btnSaveAll.addEventListener('click', async function() {
            const keys = Object.keys(dirtyMap);
            if (!keys.length) return;
            const msgEl = document.getElementById('opsRatingMsg');
            btnSaveAll.disabled = true;
            btnSaveAll.textContent = 'Synchronisiert…';
            if (msgEl) msgEl.textContent = '';

            const entries = keys.map(function(k) {
              const d = dirtyMap[k];
              const it = d.item;
              if (d.type === 'staff') {
                return {
                  type: 'staff',
                  row: it.row,
                  expectedName: it.name,
                  stars: it.stars.slice(0, 4),
                  notes: it.notes || '',
                  isAw: !!it.isAw
                };
              }
              return {
                type: 'azubi',
                row: it.row,
                expectedName: it.name,
                status: it.status || 'Vollstaendig',
                stars: it.stars.slice(0, 4),
                feedback: it.feedback || '',
                todo: it.todo || ''
              };
            });

            try {
              const saveRes = await window.SonaApi.saveOpsRatingBatch(session.standortId, entries);
              if (!saveRes || !saveRes.success) {
                if (msgEl) {
                  msgEl.style.color = '#f87171';
                  msgEl.textContent = (saveRes && saveRes.error) || 'Synchronisation fehlgeschlagen.';
                }
                return;
              }
              keys.forEach(function(k) { delete dirtyMap[k]; });
              pane.querySelectorAll('.ops-rating-row.is-dirty').forEach(function(tr) { tr.classList.remove('is-dirty'); });
              if (msgEl) {
                msgEl.style.color = '#4ade80';
                msgEl.textContent = '✓ ' + saveRes.savedCount + ' Bewertung(en) mit SONA HUB synchronisiert.';
              }
              if (window.SonaApp && window.SonaApp.toast) {
                window.SonaApp.toast(saveRes.savedCount + ' Bewertung(en) im SONA HUB gespeichert.');
              }
            } catch (err) {
              if (msgEl) {
                msgEl.style.color = '#f87171';
                msgEl.textContent = 'Verbindungsfehler: ' + (err && err.message ? err.message : String(err));
              }
            } finally {
              updateSaveButtonLabel();
            }
          });
        }
      };

      renderRatingBody();
    } catch (err) {
      const currentPane = document.getElementById('opsTabPane');
      if (!currentPane) return;
      currentPane.innerHTML =
        '<div class="card">' +
          '<div class="kicker">Mitarbeiter Ranking</div>' +
          '<p class="module-desc">Verbindungsfehler: ' + esc(err && err.message ? err.message : String(err)) + '</p>' +
        '</div>';
    }
  }

  function shiftIsoDateDays(dateIso, deltaDays) {
    const base = dateIso ? new Date(dateIso + 'T12:00:00') : new Date();
    base.setDate(base.getDate() + deltaDays);
    return base.getFullYear() + '-' + String(base.getMonth() + 1).padStart(2, '0') + '-' + String(base.getDate()).padStart(2, '0');
  }

  async function loadTodoTab(session, targetDateIso, forceRefresh) {
    const pane = document.getElementById('opsTabPane');
    if (!pane) return;
    const dateIso = targetDateIso || OPS_STATE.selectedTodoDate || todayIsoLocal();
    OPS_STATE.selectedTodoDate = dateIso;

    pane.innerHTML =
      '<div class="card">' +
        '<div class="kicker">To-Do-Liste · ' + esc(session.standortName) + '</div>' +
        '<p class="module-desc">Lade Tagesaufgaben …</p>' +
      '</div>';

    try {
      const res = await window.SonaApi.getOpsTodoDay(session.standortId, dateIso, !!forceRefresh);
      if (!document.getElementById('opsTabPane')) return;

      if (!res || !res.success) {
        pane.innerHTML =
          '<div class="card">' +
            '<div class="kicker">To-Do-Liste</div>' +
            '<h3>Tagesaufgaben konnten nicht geladen werden</h3>' +
            '<p class="module-desc">' + esc((res && res.error) || 'Unbekannter Fehler.') + '</p>' +
          '</div>';
        return;
      }

      if (res.status === 'IN_VORBEREITUNG') {
        pane.innerHTML =
          '<div class="card">' +
            '<div class="kicker">To-Do-Liste · ' + esc(session.standortName) + '</div>' +
            '<h3>Noch nicht für diesen Standort verknüpft</h3>' +
            '<p class="module-desc">' + esc(res.message || 'Für diesen Standort ist noch kein To-Do-Ordner hinterlegt.') + '</p>' +
          '</div>';
        return;
      }

      const weekDays = Array.isArray(res.weekDays) ? res.weekDays : [];
      const dayButtonsHtml = weekDays.length
        ? '<div class="ops-todo-days">' +
            weekDays.map(function(d) {
              const active = d.dateIso === res.dateIso ? ' active' : '';
              const cntTxt = d.total !== undefined ? (d.done + '/' + d.total) : d.dateShort;
              return '<button type="button" class="ops-todo-day-btn' + active + '" data-todo-date="' + esc(d.dateIso) + '">' +
                '<b>' + esc(d.dayKey) + '</b>' +
                '<span class="day-count">' + esc(d.dateShort) + '</span>' +
                (d.total !== undefined ? '<span class="day-count">' + esc(cntTxt) + '</span>' : '') +
              '</button>';
            }).join('') +
          '</div>'
        : '';

      if (res.status === 'KEIN_BLATT') {
        pane.innerHTML =
          '<div class="card">' +
            '<div class="card-head">' +
              '<div>' +
                '<div class="kicker">' + esc(res.kwLabel || '') + '</div>' +
                '<h3>To-Do-Liste · ' + esc(res.dayLabel || '') + '</h3>' +
              '</div>' +
              '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                '<button type="button" id="btnTodoPrevWeek" class="btn btn-sm">← Vorwoche</button>' +
                '<button type="button" id="btnTodoToday" class="btn btn-sm">Heute</button>' +
                '<button type="button" id="btnTodoNextWeek" class="btn btn-sm">Nächste Woche →</button>' +
              '</div>' +
            '</div>' +
            dayButtonsHtml +
            '<p class="module-desc">' + esc(res.message || 'Für diese Kalenderwoche liegt noch keine Liste vor.') + '</p>' +
          '</div>';
      } else {
        const tasks = Array.isArray(res.tasks) ? res.tasks : [];
        const fruehTasks = tasks.filter(function(t) { return t.shift !== 'Spät'; });
        const spaetTasks = tasks.filter(function(t) { return t.shift === 'Spät'; });

        const renderShiftBlock = function(title, list) {
          if (!list.length) return '';
          return '<div style="margin-bottom:14px;">' +
            '<div class="kicker" style="margin-bottom:8px;">' + esc(title) + '</div>' +
            '<div class="ops-todo-list">' +
              list.map(function(t) {
                return '<label class="ops-todo-item' + (t.done ? ' is-done' : '') + '" data-row="' + esc(t.row) + '" data-col="' + esc(t.checkCol) + '">' +
                  '<input type="checkbox" class="ops-todo-chk"' + (t.done ? ' checked' : '') + '>' +
                  '<span class="ops-todo-text">' + esc(t.text) + '</span>' +
                '</label>';
              }).join('') +
            '</div>' +
          '</div>';
        };

        const noteBlockHtml = (res.hasRatingRow || res.hasNoteRow)
          ? '<div class="card" style="margin-top:14px;">' +
              '<div class="card-head"><div><div class="kicker">Tagesabschluss</div><h3>Bewertung &amp; Notiz (' + esc(res.dayLabel) + ')</h3></div></div>' +
              (res.hasRatingRow
                ? '<div class="form-field">' +
                    '<label class="kicker">Tagesbewertung</label>' +
                    '<div class="ops-choice-group" id="opsTodoRatingGroup">' +
                      ['Gut', 'Mittel', 'Schlecht'].map(function(r) {
                        return '<button type="button" class="ops-choice-btn' + (res.dayRating === r ? ' active' : '') + '" data-rating="' + esc(r) + '">' + esc(r) + '</button>';
                      }).join('') +
                    '</div>' +
                  '</div>'
                : '') +
              (res.hasNoteRow
                ? '<div class="form-field">' +
                    '<label class="kicker" for="opsTodoNoteInput">Tagesnotiz</label>' +
                    '<textarea id="opsTodoNoteInput" class="input-control ops-textarea" rows="2" maxlength="1000" placeholder="Hinweise für die nächste Schicht …">' + esc(res.dayNote || '') + '</textarea>' +
                  '</div>'
                : '') +
              '<div style="display:flex;justify-content:flex-end;">' +
                '<button type="button" id="btnSaveTodoNote" class="btn btn-primary btn-sm">Notiz speichern</button>' +
              '</div>' +
            '</div>'
          : '';

        pane.innerHTML =
          '<div class="card">' +
            '<div class="card-head">' +
              '<div>' +
                '<div class="kicker">' + esc(res.kwLabel || '') + '</div>' +
                '<h3>' + esc(res.dayLabel) + ' · ' + esc(res.dateShort || res.dateIso) + '</h3>' +
              '</div>' +
              '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
                '<span id="opsTodoQuoteBadge" class="badge">' + esc(res.doneCount || 0) + ' / ' + esc(res.totalCount || 0) + ' (' + esc(res.quotePct || 0) + ' %)</span>' +
                '<button type="button" id="btnTodoPrevWeek" class="btn btn-sm">←</button>' +
                '<button type="button" id="btnTodoToday" class="btn btn-sm">Heute</button>' +
                '<button type="button" id="btnTodoNextWeek" class="btn btn-sm">→</button>' +
                '<button type="button" id="btnTodoReload" class="btn btn-sm">Aktualisieren</button>' +
              '</div>' +
            '</div>' +
            dayButtonsHtml +
            '<div class="ops-todo-progress-track"><div id="opsTodoProgressFill" class="ops-todo-progress-fill" style="width:' + esc(res.quotePct || 0) + '%;"></div></div>' +
            '<div class="ops-add-member-bar">' +
              '<input type="text" id="opsTodoNewText" class="input-control" style="height:34px;flex:1;min-width:200px;" maxlength="200" placeholder="Neue Tagesaufgabe für ' + esc(res.dayLabel) + ' …">' +
              '<select id="opsTodoNewShift" class="input-control" style="height:34px;width:auto;">' +
                '<option value="Früh">Frühschicht</option>' +
                '<option value="Spät">Spätschicht</option>' +
              '</select>' +
              '<button type="button" id="btnAddTodoTask" class="btn btn-primary btn-sm">+ Hinzufügen</button>' +
            '</div>' +
            '<div id="opsTodoMsg" style="margin-bottom:10px;font-size:12px;"></div>' +
            (tasks.length
              ? renderShiftBlock('Frühschicht', fruehTasks) + renderShiftBlock('Spätschicht', spaetTasks)
              : '<p class="module-desc">Für ' + esc(res.dayLabel) + ' sind noch keine Aufgaben eingetragen.</p>') +
          '</div>' +
          noteBlockHtml;

        // Checkbox-Toggle Events
        let localDone = res.doneCount || 0;
        const localTotal = res.totalCount || 0;
        const updateProgressUi = function() {
          const pct = localTotal > 0 ? Math.round((localDone / localTotal) * 100) : 0;
          const badge = document.getElementById('opsTodoQuoteBadge');
          const fill = document.getElementById('opsTodoProgressFill');
          if (badge) badge.textContent = localDone + ' / ' + localTotal + ' (' + pct + ' %)';
          if (fill) fill.style.width = pct + '%';
        };

        pane.querySelectorAll('.ops-todo-item').forEach(function(itemEl) {
          const chk = itemEl.querySelector('.ops-todo-chk');
          if (!chk) return;
          chk.addEventListener('change', async function() {
            const newDone = !!chk.checked;
            itemEl.classList.toggle('is-done', newDone);
            localDone += newDone ? 1 : -1;
            updateProgressUi();
            try {
              const tRes = await window.SonaApi.toggleOpsTodoTask(
                session.standortId,
                res.dateIso,
                parseInt(itemEl.dataset.row, 10),
                parseInt(itemEl.dataset.col, 10),
                newDone
              );
              if (!tRes || !tRes.success) {
                chk.checked = !newDone;
                itemEl.classList.toggle('is-done', !newDone);
                localDone += newDone ? -1 : 1;
                updateProgressUi();
                const msgEl = document.getElementById('opsTodoMsg');
                if (msgEl) { msgEl.style.color = '#f87171'; msgEl.textContent = (tRes && tRes.error) || 'Speichern fehlgeschlagen.'; }
              }
            } catch (eTog) {
              chk.checked = !newDone;
              itemEl.classList.toggle('is-done', !newDone);
              localDone += newDone ? -1 : 1;
              updateProgressUi();
            }
          });
        });

        // Neue Tagesaufgabe hinzufügen
        const addTaskFn = async function() {
          const txtEl = document.getElementById('opsTodoNewText');
          const shiftEl = document.getElementById('opsTodoNewShift');
          const btn = document.getElementById('btnAddTodoTask');
          const msgEl = document.getElementById('opsTodoMsg');
          const val = txtEl ? txtEl.value.trim() : '';
          if (val.length < 2) {
            if (msgEl) { msgEl.style.color = '#f87171'; msgEl.textContent = 'Bitte eine Aufgabe eingeben.'; }
            return;
          }
          if (btn) { btn.disabled = true; btn.textContent = 'Speichert…'; }
          try {
            const addRes = await window.SonaApi.addOpsTodoTask(session.standortId, res.dateIso, shiftEl ? shiftEl.value : 'Früh', val);
            if (!addRes || !addRes.success) {
              if (msgEl) { msgEl.style.color = '#f87171'; msgEl.textContent = (addRes && addRes.error) || 'Hinzufügen fehlgeschlagen.'; }
              return;
            }
            if (window.SonaApp && window.SonaApp.toast) window.SonaApp.toast('Tagesaufgabe hinzugefügt.');
            loadTodoTab(session, res.dateIso, false);
          } catch (eAdd) {
            if (msgEl) { msgEl.style.color = '#f87171'; msgEl.textContent = 'Verbindungsfehler.'; }
          } finally {
            if (btn) { btn.disabled = false; btn.textContent = '+ Hinzufügen'; }
          }
        };
        const btnAdd = document.getElementById('btnAddTodoTask');
        if (btnAdd) btnAdd.addEventListener('click', addTaskFn);
        const newTxtEl = document.getElementById('opsTodoNewText');
        if (newTxtEl) {
          newTxtEl.addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter') { ev.preventDefault(); addTaskFn(); }
          });
        }

        // Tagesbewertung & Notiz speichern
        let selectedRating = res.dayRating || '';
        const ratingGrp = document.getElementById('opsTodoRatingGroup');
        if (ratingGrp) {
          ratingGrp.querySelectorAll('.ops-choice-btn').forEach(function(b) {
            b.addEventListener('click', function() {
              ratingGrp.querySelectorAll('.ops-choice-btn').forEach(function(x) { x.classList.remove('active'); });
              b.classList.add('active');
              selectedRating = b.dataset.rating || '';
            });
          });
        }
        const btnNote = document.getElementById('btnSaveTodoNote');
        if (btnNote) {
          btnNote.addEventListener('click', async function() {
            const noteEl = document.getElementById('opsTodoNoteInput');
            btnNote.disabled = true;
            btnNote.textContent = 'Speichert…';
            try {
              const nRes = await window.SonaApi.saveOpsTodoNote(session.standortId, res.dateIso, selectedRating, noteEl ? noteEl.value : undefined);
              if (nRes && nRes.success && window.SonaApp && window.SonaApp.toast) {
                window.SonaApp.toast('Tagesnotiz gespeichert.');
              }
            } finally {
              btnNote.disabled = false;
              btnNote.textContent = 'Notiz speichern';
            }
          });
        }
      }

      // Navigation Events (Tage & Wochen)
      pane.querySelectorAll('.ops-todo-day-btn').forEach(function(b) {
        b.addEventListener('click', function() {
          loadTodoTab(session, b.dataset.todoDate, false);
        });
      });
      const prevBtn = document.getElementById('btnTodoPrevWeek');
      const todayBtn = document.getElementById('btnTodoToday');
      const nextBtn = document.getElementById('btnTodoNextWeek');
      const reloadBtn = document.getElementById('btnTodoReload');
      if (prevBtn) prevBtn.addEventListener('click', function() { loadTodoTab(session, shiftIsoDateDays(dateIso, -7), false); });
      if (todayBtn) todayBtn.addEventListener('click', function() { loadTodoTab(session, todayIsoLocal(), false); });
      if (nextBtn) nextBtn.addEventListener('click', function() { loadTodoTab(session, shiftIsoDateDays(dateIso, 7), false); });
      if (reloadBtn) reloadBtn.addEventListener('click', function() { loadTodoTab(session, dateIso, true); });
    } catch (err) {
      const currentPane = document.getElementById('opsTabPane');
      if (!currentPane) return;
      currentPane.innerHTML =
        '<div class="card">' +
          '<div class="kicker">To-Do-Liste</div>' +
          '<p class="module-desc">Verbindungsfehler: ' + esc(err && err.message ? err.message : String(err)) + '</p>' +
        '</div>';
    }
  }

  async function loadPutzplanTab(session, targetDateIso) {
    const pane = document.getElementById('opsTabPane');
    if (!pane) return;
    const dateIso = targetDateIso || OPS_STATE.selectedPutzplanDate || todayIsoLocal();
    OPS_STATE.selectedPutzplanDate = dateIso;

    pane.innerHTML =
      '<div class="card">' +
        '<div class="kicker">Putzplan · ' + esc(session.standortName) + '</div>' +
        '<p class="module-desc">Lade Tagesaufgaben …</p>' +
      '</div>';

    try {
      const res = await window.SonaApi.getOpsPutzplanDay(session.standortId, dateIso);
      if (!document.getElementById('opsTabPane')) return;

      if (!res || !res.success) {
        pane.innerHTML =
          '<div class="card">' +
            '<div class="kicker">Putzplan</div>' +
            '<h3>Putzplan konnte nicht geladen werden</h3>' +
            '<p class="module-desc">' + esc((res && res.error) || 'Unbekannter Fehler.') + '</p>' +
          '</div>';
        return;
      }

      if (res.status === 'IN_VORBEREITUNG') {
        pane.innerHTML =
          '<div class="card">' +
            '<div class="kicker">Putzplan · ' + esc(session.standortName) + '</div>' +
            '<h3>Noch nicht für diesen Standort verknüpft</h3>' +
            '<p class="module-desc">' + esc(res.message || 'Für diesen Standort ist noch kein Putzplan hinterlegt.') + '</p>' +
          '</div>';
        return;
      }

      const weekDays = Array.isArray(res.weekDays) ? res.weekDays : [];
      const dayButtonsHtml = weekDays.length
        ? '<div class="ops-todo-days">' +
            weekDays.map(function(d) {
              const active = d.dateIso === res.dateIso ? ' active' : '';
              return '<button type="button" class="ops-todo-day-btn' + active + '" data-putz-date="' + esc(d.dateIso) + '">' +
                '<b>' + esc(d.dayKey) + '</b>' +
                '<span class="day-count">' + esc(d.dateShort) + '</span>' +
                '<span class="day-count">' + esc(d.done) + '/' + esc(d.total) + '</span>' +
              '</button>';
            }).join('') +
          '</div>'
        : '';

      if (res.status === 'KEINE_ZEILE') {
        pane.innerHTML =
          '<div class="card">' +
            '<div class="card-head">' +
              '<div>' +
                '<div class="kicker">' + esc(res.kwLabel || '') + '</div>' +
                '<h3>Putzplan · ' + esc(res.dayLabel || '') + ' (' + esc(res.dateShort || res.dateIso) + ')</h3>' +
              '</div>' +
              '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                '<button type="button" id="btnPutzPrevWeek" class="btn btn-sm">←</button>' +
                '<button type="button" id="btnPutzToday" class="btn btn-sm">Heute</button>' +
                '<button type="button" id="btnPutzNextWeek" class="btn btn-sm">→</button>' +
              '</div>' +
            '</div>' +
            dayButtonsHtml +
            '<p class="module-desc">' + esc(res.message || 'Für diesen Tag ist noch keine Zeile angelegt.') + '</p>' +
          '</div>';
      } else {
        const tasks = Array.isArray(res.tasks) ? res.tasks : [];
        const defaultPerson = res.person || getSavedOpsName(session);

        pane.innerHTML =
          '<div class="card">' +
            '<div class="card-head">' +
              '<div>' +
                '<div class="kicker">' + esc(res.kwLabel || '') + ' · ' + esc(res.sheetName || 'Putzplan') + '</div>' +
                '<h3>' + esc(res.dayLabel) + ' · ' + esc(res.dateShort || res.dateIso) + '</h3>' +
              '</div>' +
              '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
                '<span id="opsPutzQuoteBadge" class="badge">' + esc(res.doneCount || 0) + ' / ' + esc(res.totalCount || 5) + ' (' + esc(res.quotePct || 0) + ' %)</span>' +
                '<button type="button" id="btnPutzPrevWeek" class="btn btn-sm">←</button>' +
                '<button type="button" id="btnPutzToday" class="btn btn-sm">Heute</button>' +
                '<button type="button" id="btnPutzNextWeek" class="btn btn-sm">→</button>' +
                '<button type="button" id="btnPutzReload" class="btn btn-sm">Aktualisieren</button>' +
              '</div>' +
            '</div>' +
            dayButtonsHtml +
            '<div class="ops-todo-progress-track"><div id="opsPutzProgressFill" class="ops-todo-progress-fill" style="width:' + esc(res.quotePct || 0) + '%;"></div></div>' +
            '<div id="opsPutzMsg" style="margin-bottom:10px;font-size:12px;"></div>' +
            '<div class="ops-todo-list" style="margin-bottom:16px;">' +
              tasks.map(function(t) {
                return '<label class="ops-todo-item' + (t.done ? ' is-done' : '') + '" data-col="' + esc(t.col) + '">' +
                  '<input type="checkbox" class="ops-putz-chk"' + (t.done ? ' checked' : '') + '>' +
                  '<span class="ops-todo-text">' + esc(t.name) + '</span>' +
                '</label>';
              }).join('') +
            '</div>' +
            '<div class="user-modal-grid">' +
              '<div class="form-field">' +
                '<label class="kicker" for="opsPutzPerson">Mitarbeiter / Name</label>' +
                '<input type="text" id="opsPutzPerson" class="input-control" maxlength="80" value="' + esc(defaultPerson) + '" placeholder="Name">' +
              '</div>' +
              '<div class="form-field">' +
                '<label class="kicker" for="opsPutzRemark">Bemerkung (optional)</label>' +
                '<input type="text" id="opsPutzRemark" class="input-control" maxlength="1000" value="' + esc(res.remark || '') + '" placeholder="Hinweise …">' +
              '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:flex-end;">' +
              '<button type="button" id="btnSavePutzMeta" class="btn btn-primary btn-sm">Name &amp; Bemerkung speichern</button>' +
            '</div>' +
          '</div>';

        let localDone = res.doneCount || 0;
        const localTotal = res.totalCount || tasks.length || 5;
        const updatePutzProgress = function() {
          const pct = localTotal > 0 ? Math.round((localDone / localTotal) * 100) : 0;
          const badge = document.getElementById('opsPutzQuoteBadge');
          const fill = document.getElementById('opsPutzProgressFill');
          if (badge) badge.textContent = localDone + ' / ' + localTotal + ' (' + pct + ' %)';
          if (fill) fill.style.width = pct + '%';
        };

        pane.querySelectorAll('.ops-todo-item').forEach(function(itemEl) {
          const chk = itemEl.querySelector('.ops-putz-chk');
          if (!chk) return;
          chk.addEventListener('change', async function() {
            const newDone = !!chk.checked;
            itemEl.classList.toggle('is-done', newDone);
            localDone += newDone ? 1 : -1;
            updatePutzProgress();
            const personEl = document.getElementById('opsPutzPerson');
            const personVal = personEl ? personEl.value.trim() : '';
            try {
              const tRes = await window.SonaApi.toggleOpsPutzplanTask(
                session.standortId,
                res.dateIso,
                parseInt(itemEl.dataset.col, 10),
                newDone,
                personVal
              );
              if (!tRes || !tRes.success) {
                chk.checked = !newDone;
                itemEl.classList.toggle('is-done', !newDone);
                localDone += newDone ? -1 : 1;
                updatePutzProgress();
                const msgEl = document.getElementById('opsPutzMsg');
                if (msgEl) { msgEl.style.color = '#f87171'; msgEl.textContent = (tRes && tRes.error) || 'Speichern fehlgeschlagen.'; }
              } else if (tRes.person && personEl && !personEl.value.trim()) {
                personEl.value = tRes.person;
              }
            } catch (eTog) {
              chk.checked = !newDone;
              itemEl.classList.toggle('is-done', !newDone);
              localDone += newDone ? -1 : 1;
              updatePutzProgress();
            }
          });
        });

        const btnMeta = document.getElementById('btnSavePutzMeta');
        if (btnMeta) {
          btnMeta.addEventListener('click', async function() {
            const personEl = document.getElementById('opsPutzPerson');
            const remarkEl = document.getElementById('opsPutzRemark');
            const pVal = personEl ? personEl.value.trim() : '';
            const rVal = remarkEl ? remarkEl.value.trim() : '';
            btnMeta.disabled = true;
            btnMeta.textContent = 'Speichert…';
            try {
              const mRes = await window.SonaApi.saveOpsPutzplanMeta(session.standortId, res.dateIso, pVal, rVal);
              if (mRes && mRes.success) {
                if (pVal) saveOpsName(session, pVal);
                if (window.SonaApp && window.SonaApp.toast) window.SonaApp.toast('Putzplan aktualisiert.');
              }
            } finally {
              btnMeta.disabled = false;
              btnMeta.textContent = 'Name & Bemerkung speichern';
            }
          });
        }
      }

      pane.querySelectorAll('.ops-todo-day-btn').forEach(function(b) {
        b.addEventListener('click', function() {
          loadPutzplanTab(session, b.dataset.putzDate);
        });
      });
      const prevBtn = document.getElementById('btnPutzPrevWeek');
      const todayBtn = document.getElementById('btnPutzToday');
      const nextBtn = document.getElementById('btnPutzNextWeek');
      const reloadBtn = document.getElementById('btnPutzReload');
      if (prevBtn) prevBtn.addEventListener('click', function() { loadPutzplanTab(session, shiftIsoDateDays(dateIso, -7)); });
      if (todayBtn) todayBtn.addEventListener('click', function() { loadPutzplanTab(session, todayIsoLocal()); });
      if (nextBtn) nextBtn.addEventListener('click', function() { loadPutzplanTab(session, shiftIsoDateDays(dateIso, 7)); });
      if (reloadBtn) reloadBtn.addEventListener('click', function() { loadPutzplanTab(session, dateIso); });
    } catch (err) {
      const currentPane = document.getElementById('opsTabPane');
      if (!currentPane) return;
      currentPane.innerHTML =
        '<div class="card">' +
          '<div class="kicker">Putzplan</div>' +
          '<p class="module-desc">Verbindungsfehler: ' + esc(err && err.message ? err.message : String(err)) + '</p>' +
        '</div>';
    }
  }

  window.SonaOperationsModule = {
    openExternalTab: openExternalTab,
    renderAuswertungInto: function(targetEl, session) {
      if (!targetEl || !session) return;
      loadMonthlySummary(session, false, OPS_STATE.selectedPeriod, targetEl);
    },
    mount: function(session, mod, sectionKey) {
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
      const opTabs = (perms.tabPermissions && perms.tabPermissions.operations !== undefined)
        ? perms.tabPermissions.operations
        : 'ALL';

      const canReklamation = (opTabs === 'ALL') || (Array.isArray(opTabs) && opTabs.indexOf('reklamation') !== -1);
      const canSchwundInput = (opTabs === 'ALL') || (Array.isArray(opTabs) && opTabs.indexOf('schwund_eingabe') !== -1);
      const canBruchInput = (opTabs === 'ALL') || (Array.isArray(opTabs) && opTabs.indexOf('bruch_eingabe') !== -1);
      const canStaffRating = (opTabs === 'ALL') || (Array.isArray(opTabs) && opTabs.indexOf('mitarbeiterbewertung') !== -1);

      const activeSection = sectionKey || 'home';

      const renderOpsHome = function() {
        const cards = [];
        if (canSchwundInput) {
          cards.push(
            '<button type="button" class="home-tile" data-ops-ext="' + esc(schwundUrl) + '">' +
              '<div class="home-tile-head"><h4 class="home-tile-title">1. Schwund</h4><span class="home-tile-arrow">↗</span></div>' +
              '<p class="home-tile-desc">Verderb &amp; Überproduktion erfassen</p>' +
            '</button>'
          );
        }
        if (canBruchInput) {
          cards.push(
            '<button type="button" class="home-tile" data-ops-ext="' + esc(bruchUrl) + '">' +
              '<div class="home-tile-head"><h4 class="home-tile-title">2. Bruch</h4><span class="home-tile-arrow">↗</span></div>' +
              '<p class="home-tile-desc">Glas-, Geschirr- &amp; Flaschenbruch erfassen</p>' +
            '</button>'
          );
        }
        if (canReklamation) {
          cards.push(
            '<button type="button" class="home-tile" data-ops-nav="ops_reklamation">' +
              '<div class="home-tile-head"><h4 class="home-tile-title">3. Reklamation und Beschwerden</h4><span class="home-tile-arrow">→</span></div>' +
              '<p class="home-tile-desc">Gästefeedback &amp; Reklamationen dokumentieren</p>' +
            '</button>'
          );
        }
        cards.push(
          '<button type="button" class="home-tile" data-ops-nav="ops_todo">' +
            '<div class="home-tile-head"><h4 class="home-tile-title">4. To-Do-Liste</h4><span class="home-tile-arrow">→</span></div>' +
            '<p class="home-tile-desc">Aufgaben für Küche, Bar &amp; Service</p>' +
          '</button>'
        );
        cards.push(
          '<button type="button" class="home-tile" data-ops-nav="ops_putzplan">' +
            '<div class="home-tile-head"><h4 class="home-tile-title">5. Putzplan</h4><span class="home-tile-arrow">→</span></div>' +
            '<p class="home-tile-desc">Tägliche &amp; wöchentliche Reinigungspläne</p>' +
          '</button>'
        );
        if (canStaffRating) {
          cards.push(
            '<button type="button" class="home-tile" data-ops-nav="ops_ranking">' +
              '<div class="home-tile-head"><h4 class="home-tile-title">6. Mitarbeiter Ranking</h4><span class="home-tile-arrow">→</span></div>' +
              '<p class="home-tile-desc">Personal Scorecard &amp; Azubi-Entwicklung</p>' +
            '</button>'
          );
        }

        container.innerHTML =
          '<div class="pillar-section">' +
            '<div class="pillar-head"><h3>Operations · ' + esc(session.standortName) + '</h3></div>' +
            '<div class="grid-3">' + cards.join('') + '</div>' +
          '</div>';

        container.querySelectorAll('[data-ops-ext]').forEach(function(btn) {
          btn.addEventListener('click', function() {
            if (btn.dataset.opsExt) openExternalTab(btn.dataset.opsExt);
          });
        });
        container.querySelectorAll('[data-ops-nav]').forEach(function(btn) {
          btn.addEventListener('click', function() {
            if (window.SonaApp && window.SonaApp.openView) {
              window.SonaApp.openView(btn.dataset.opsNav);
            }
          });
        });
      };

      const renderSectionWrapper = function(title) {
        container.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap;">' +
            '<button type="button" id="btnOpsBackHome" class="btn btn-sm">← Zurück zu Operations</button>' +
            '<span class="kicker">' + esc(title) + ' · ' + esc(session.standortName) + '</span>' +
          '</div>' +
          '<div id="opsTabPane"></div>';
        const backBtn = document.getElementById('btnOpsBackHome');
        if (backBtn) {
          backBtn.addEventListener('click', function() {
            if (window.SonaApp && window.SonaApp.openView) {
              window.SonaApp.openView('mod_operations');
            } else {
              renderOpsHome();
            }
          });
        }
      };

      if (activeSection === 'reklamation') {
        if (!canReklamation) {
          container.innerHTML = '<div class="card"><p class="module-desc">Kein Zugriff auf Reklamation und Beschwerden.</p></div>';
          return;
        }
        renderSectionWrapper('Reklamation und Beschwerden');
        loadReklamationTab(session, OPS_STATE.selectedMonth);
        return;
      }

      if (activeSection === 'ranking') {
        if (!canStaffRating) {
          container.innerHTML = '<div class="card"><p class="module-desc">Kein Zugriff auf Mitarbeiter Ranking.</p></div>';
          return;
        }
        renderSectionWrapper('Mitarbeiter Ranking');
        loadRatingTab(session);
        return;
      }

      if (activeSection === 'todo') {
        renderSectionWrapper('To-Do-Liste');
        loadTodoTab(session, OPS_STATE.selectedTodoDate || todayIsoLocal(), false);
        return;
      }

      if (activeSection === 'putzplan') {
        renderSectionWrapper('Putzplan');
        loadPutzplanTab(session, OPS_STATE.selectedPutzplanDate || todayIsoLocal());
        return;
      }

      renderOpsHome();
    }
  };
})();
