'use strict';

(function() {
  const OPS_STATE = {
    activeTab: 'reklamation',
    selectedMonth: '',
    selectedPeriod: '',
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

  async function loadMonthlySummary(session, forceRefresh, periodKey) {
    const slot = document.getElementById('opsSchwundKpiSlot');
    if (!slot) return;
    const chosenPeriod = periodKey !== undefined ? periodKey : (OPS_STATE.selectedPeriod || '');
    slot.innerHTML =
      '<div class="card">' +
        '<div class="kicker">Schwund- &amp; Bruch-Auswertung · ' + esc(session.standortName) + '</div>' +
        '<p class="module-desc">Lade Auswertung aus SCHWUND_NEU &amp; BRUCH_NEU …</p>' +
      '</div>';

    try {
      const res = await window.SonaApi.getOpsMonthlySummary(session.standortId, !!forceRefresh, chosenPeriod);
      const currentSlot = document.getElementById('opsSchwundKpiSlot');
      if (!currentSlot) return;

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

      const periodSel = document.getElementById('opsStatsPeriodSelect');
      if (periodSel) {
        periodSel.addEventListener('change', function() {
          OPS_STATE.selectedPeriod = periodSel.value;
          loadMonthlySummary(session, false, periodSel.value);
        });
      }
      const reloadBtn = document.getElementById('btnReloadOpsSummary');
      if (reloadBtn) {
        reloadBtn.addEventListener('click', function() {
          loadMonthlySummary(session, true, OPS_STATE.selectedPeriod);
        });
      }
    } catch (err) {
      const currentSlot = document.getElementById('opsSchwundKpiSlot');
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

  function starShortLabel(starVal) {
    const s = String(starVal || '');
    if (s.toLowerCase().indexOf('außer') !== -1 || s.toLowerCase().indexOf('ausser') !== -1) return 'A.W.';
    const m = s.match(/\((\d)\)/);
    return m ? (m[1] + '★') : '–';
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

  function renderStarButtons(currentVal, starOptions, disabledAttr) {
    return '<div class="ops-choice-group" style="gap:4px;">' +
      (starOptions || []).map(function(opt) {
        const active = opt === currentVal ? ' active' : '';
        return '<button type="button" class="ops-choice-btn ops-star-pick' + active + '" data-star="' + esc(opt) + '" style="padding:5px 8px;font-size:11px;"' + disabledAttr + '>' + esc(starShortLabel(opt)) + '</button>';
      }).join('') +
    '</div>';
  }

  async function loadRatingTab(session) {
    const pane = document.getElementById('opsTabPane');
    if (!pane) return;

    pane.innerHTML =
      '<div class="card">' +
        '<div class="kicker">Mitarbeiterbewertung · ' + esc(session.standortName) + '</div>' +
        '<p class="module-desc">Lade Personal_Scorecard &amp; Azubi_Entwicklung aus dem SONA HUB …</p>' +
      '</div>';

    try {
      const res = await window.SonaApi.getOpsRatingMeta(session.standortId);
      if (!document.getElementById('opsTabPane')) return;

      if (!res || !res.success) {
        pane.innerHTML =
          '<div class="card">' +
            '<div class="kicker">Mitarbeiterbewertung</div>' +
            '<h3>SONA HUB konnte nicht geladen werden</h3>' +
            '<p class="module-desc">' + esc((res && res.error) || 'Unbekannter Fehler.') + '</p>' +
          '</div>';
        return;
      }

      if (res.status === 'IN_VORBEREITUNG') {
        pane.innerHTML =
          '<div class="card">' +
            '<div class="kicker">Mitarbeiterbewertung · ' + esc(session.standortName) + '</div>' +
            '<h3>Noch nicht für diesen Standort verknüpft</h3>' +
            '<p class="module-desc">' + esc(res.message || 'Für diesen Standort ist noch kein SONA HUB hinterlegt.') + '</p>' +
          '</div>';
        return;
      }

      const starOptions = Array.isArray(res.starOptions) ? res.starOptions : [];
      const staffCriteria = Array.isArray(res.staffCriteria) ? res.staffCriteria : [];
      const azubiCriteria = Array.isArray(res.azubiCriteria) ? res.azubiCriteria : [];
      const azubiStatuses = Array.isArray(res.azubiStatusOptions) ? res.azubiStatusOptions : ['Vollstaendig', 'Rueckstand', 'Fehlt'];
      const staffList = Array.isArray(res.staff) ? res.staff : [];
      const azubiList = Array.isArray(res.azubis) ? res.azubis : [];
      const disabledAttr = res.canWrite ? '' : ' disabled';

      const renderRatingBody = function() {
        const isStaff = OPS_STATE.ratingSubTab !== 'azubi';
        const list = isStaff ? staffList : azubiList;
        const criteria = isStaff ? staffCriteria : azubiCriteria;

        let cardsHtml = '';
        if (!list.length) {
          cardsHtml = '<div class="card"><p class="module-desc">Keine Einträge in diesem Blatt vorhanden.</p></div>';
        } else {
          cardsHtml = list.map(function(item, idx) {
            const critHtml = criteria.map(function(critLabel, cIdx) {
              return '<div class="form-field" style="margin-bottom:8px;" data-crit-idx="' + cIdx + '">' +
                '<label class="kicker" style="display:block;margin-bottom:4px;">' + esc(critLabel) + '</label>' +
                renderStarButtons(item.stars[cIdx] || 'Außer Wertung', starOptions, disabledAttr) +
              '</div>';
            }).join('');

            const extraHtml = isStaff
              ? '<div class="form-field">' +
                  '<label class="kicker">Was lief gut? / Was lief schlecht? (Details &amp; Notizen)</label>' +
                  '<textarea class="input-control ops-textarea ops-rating-notes" rows="2" maxlength="2000" placeholder="Beobachtungen, Stärken, Hinweise …"' + disabledAttr + '>' + esc(item.notes || '') + '</textarea>' +
                '</div>' +
                '<label style="display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--os-silk);cursor:pointer;">' +
                  '<input type="checkbox" class="ops-rating-aw"' + (item.isAw ? ' checked' : '') + disabledAttr + '> Außer Wertung (nicht in Team-Score einbeziehen)' +
                '</label>'
              : '<div class="form-field">' +
                  '<label class="kicker">Berichtsheft-Status</label>' +
                  '<select class="input-control ops-rating-status" style="height:34px;"' + disabledAttr + '>' +
                    azubiStatuses.map(function(st) {
                      return '<option value="' + esc(st) + '"' + (st === item.status ? ' selected' : '') + '>' + esc(st) + '</option>';
                    }).join('') +
                  '</select>' +
                '</div>' +
                '<div class="user-modal-grid">' +
                  '<div class="form-field">' +
                    '<label class="kicker">Was lief gut? (Lernfortschritt &amp; Feedback)</label>' +
                    '<textarea class="input-control ops-textarea ops-rating-feedback" rows="2" maxlength="2000"' + disabledAttr + '>' + esc(item.feedback || '') + '</textarea>' +
                  '</div>' +
                  '<div class="form-field">' +
                    '<label class="kicker">Lernfelder &amp; To-Dos (Nächste Ziele)</label>' +
                    '<textarea class="input-control ops-textarea ops-rating-todo" rows="2" maxlength="2000"' + disabledAttr + '>' + esc(item.todo || '') + '</textarea>' +
                  '</div>' +
                '</div>';

            return '<div class="card ops-rating-card" data-idx="' + idx + '" data-type="' + (isStaff ? 'staff' : 'azubi') + '" data-row="' + esc(item.row) + '" data-name="' + esc(item.name) + '" style="margin-bottom:14px;">' +
              '<div class="card-head">' +
                '<div>' +
                  '<div class="kicker">' + esc(item.dept || 'Team') + ' · Zeile ' + esc(item.row) + '</div>' +
                  '<h3>' + esc(item.name) + '</h3>' +
                '</div>' +
                '<div style="display:flex;gap:8px;align-items:center;">' +
                  '<span class="badge ops-rating-score-badge">Score Ø: ' + esc(item.score || '-') + '</span>' +
                  (res.canWrite
                    ? '<button type="button" class="btn btn-primary btn-sm ops-rating-save-btn">Speichern &amp; Sync</button>'
                    : '') +
                '</div>' +
              '</div>' +
              '<div class="grid-2">' + critHtml + '</div>' +
              extraHtml +
              '<div class="ops-rating-msg" style="margin-top:8px;font-size:12px;"></div>' +
            '</div>';
          }).join('');
        }

        pane.innerHTML =
          '<div class="card" style="margin-bottom:16px;">' +
            '<div class="card-head">' +
              '<div>' +
                '<div class="kicker">SONA HUB Synchronisiert · ' + esc(session.standortName) + '</div>' +
                '<h3>Mitarbeiterbewertung (' + esc(isStaff ? 'Personal Scorecard' : 'Azubi-Entwicklung') + ')</h3>' +
                (res.kwBanner ? '<div style="font-size:12px;color:var(--os-silk);margin-top:4px;">' + esc(res.kwBanner) + '</div>' : '') +
              '</div>' +
              '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
                '<button type="button" id="btnRatingSubStaff" class="bv-tab-btn' + (isStaff ? ' active' : '') + '">Personal Scorecard (' + esc(staffList.length) + ')</button>' +
                '<button type="button" id="btnRatingSubAzubi" class="bv-tab-btn' + (!isStaff ? ' active' : '') + '">Azubi-Entwicklung (' + esc(azubiList.length) + ')</button>' +
                '<button type="button" id="btnReloadRatings" class="btn btn-sm">Neu laden</button>' +
              '</div>' +
            '</div>' +
            (!res.canWrite ? '<p class="module-desc">Du hast aktuell Leserecht. Zum Speichern in den SONA HUB wird WRITE- oder ADMIN-Zugriff benötigt.</p>' : '') +
          '</div>' +
          cardsHtml;

        const btnStaff = document.getElementById('btnRatingSubStaff');
        const btnAzubi = document.getElementById('btnRatingSubAzubi');
        const btnReload = document.getElementById('btnReloadRatings');
        if (btnStaff) btnStaff.addEventListener('click', function() { OPS_STATE.ratingSubTab = 'staff'; renderRatingBody(); });
        if (btnAzubi) btnAzubi.addEventListener('click', function() { OPS_STATE.ratingSubTab = 'azubi'; renderRatingBody(); });
        if (btnReload) btnReload.addEventListener('click', function() { loadRatingTab(session); });

        pane.querySelectorAll('.ops-rating-card').forEach(function(card) {
          const idx = parseInt(card.dataset.idx, 10);
          const item = list[idx];
          if (!item) return;

          const updateLiveScore = function() {
            const awEl = card.querySelector('.ops-rating-aw');
            const isAw = awEl ? !!awEl.checked : false;
            const badge = card.querySelector('.ops-rating-score-badge');
            if (badge) {
              badge.textContent = 'Score Ø: ' + calcClientAvgScore(item.stars, isAw);
            }
          };

          card.querySelectorAll('.form-field[data-crit-idx]').forEach(function(field) {
            const cIdx = parseInt(field.dataset.critIdx, 10);
            field.querySelectorAll('.ops-star-pick').forEach(function(btn) {
              btn.addEventListener('click', function() {
                if (!res.canWrite) return;
                field.querySelectorAll('.ops-star-pick').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                item.stars[cIdx] = btn.dataset.star;
                const awEl = card.querySelector('.ops-rating-aw');
                if (awEl && btn.dataset.star !== 'Außer Wertung') awEl.checked = false;
                updateLiveScore();
              });
            });
          });

          const awBox = card.querySelector('.ops-rating-aw');
          if (awBox) {
            awBox.addEventListener('change', function() {
              item.isAw = !!awBox.checked;
              updateLiveScore();
            });
          }

          const saveBtn = card.querySelector('.ops-rating-save-btn');
          if (saveBtn) {
            saveBtn.addEventListener('click', async function() {
              const msgEl = card.querySelector('.ops-rating-msg');
              saveBtn.disabled = true;
              saveBtn.textContent = 'Synchronisiert…';
              if (msgEl) msgEl.textContent = '';

              try {
                const payload = {
                  type: card.dataset.type,
                  row: parseInt(card.dataset.row, 10),
                  expectedName: card.dataset.name,
                  stars: item.stars.slice(0, 4)
                };
                if (payload.type === 'staff') {
                  const notesEl = card.querySelector('.ops-rating-notes');
                  const awEl = card.querySelector('.ops-rating-aw');
                  payload.notes = notesEl ? notesEl.value : '';
                  payload.isAw = awEl ? !!awEl.checked : false;
                  item.notes = payload.notes;
                  item.isAw = payload.isAw;
                } else {
                  const statusEl = card.querySelector('.ops-rating-status');
                  const fbEl = card.querySelector('.ops-rating-feedback');
                  const todoEl = card.querySelector('.ops-rating-todo');
                  payload.status = statusEl ? statusEl.value : 'Vollstaendig';
                  payload.feedback = fbEl ? fbEl.value : '';
                  payload.todo = todoEl ? todoEl.value : '';
                  item.status = payload.status;
                  item.feedback = payload.feedback;
                  item.todo = payload.todo;
                }

                const saveRes = await window.SonaApi.saveOpsRating(session.standortId, payload);
                if (!saveRes || !saveRes.success) {
                  if (msgEl) {
                    msgEl.style.color = '#f87171';
                    msgEl.textContent = (saveRes && saveRes.error) || 'Synchronisation fehlgeschlagen.';
                  }
                  return;
                }

                item.score = saveRes.score;
                const badge = card.querySelector('.ops-rating-score-badge');
                if (badge) badge.textContent = 'Score Ø: ' + (saveRes.score || '-');
                if (msgEl) {
                  msgEl.style.color = '#4ade80';
                  msgEl.textContent = '✓ Mit SONA HUB synchronisiert (Zeile ' + saveRes.row + ').';
                }
                if (window.SonaApp && window.SonaApp.toast) {
                  window.SonaApp.toast('Bewertung für ' + item.name + ' im SONA HUB gespeichert.');
                }
              } catch (err) {
                if (msgEl) {
                  msgEl.style.color = '#f87171';
                  msgEl.textContent = 'Verbindungsfehler: ' + (err && err.message ? err.message : String(err));
                }
              } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Speichern & Sync';
              }
            });
          }
        });
      };

      renderRatingBody();
    } catch (err) {
      const currentPane = document.getElementById('opsTabPane');
      if (!currentPane) return;
      currentPane.innerHTML =
        '<div class="card">' +
          '<div class="kicker">Mitarbeiterbewertung</div>' +
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
      const canStaffRating = (opTabs === 'ALL') || (Array.isArray(opTabs) && opTabs.indexOf('mitarbeiterbewertung') !== -1);

      const tabs = [];
      if (canReklamation) tabs.push({ id: 'reklamation', label: 'Gäste-Reklamation' });
      if (canSchwundInput || canBruchInput) tabs.push({ id: 'inputs', label: 'Schwund & Bruch' });
      if (canSchwundStats) tabs.push({ id: 'stats', label: 'Schwund- & Bruch-Auswertung' });
      if (canStaffRating) tabs.push({ id: 'mitarbeiterbewertung', label: 'Mitarbeiterbewertung' });

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
              '<div class="pillar-head"><h3>Weitere Operations-Bausteine</h3></div>' +
              '<div class="grid-2">' +
                '<div class="module-card">' +
                  '<div><div class="kicker">SONA HUB Synchronisiert</div><h3>Mitarbeiterbewertung</h3><p class="module-desc">Personal Scorecard (4 Kriterien) &amp; Azubi-Entwicklung direkt mit dem SONA HUB synchronisieren.</p></div>' +
                  '<div>' +
                    (canStaffRating
                      ? '<button type="button" id="btnOpenStaffRatingFromInputs" class="btn btn-primary btn-sm">Jetzt bewerten →</button>'
                      : '<span class="badge">Kein Zugriff</span>') +
                  '</div>' +
                '</div>' +
                '<div class="module-card"><div><div class="kicker">In Vorbereitung</div><h3>Checklisten &amp; Übergabe</h3><p class="module-desc">Öffnungs-, Schicht- und Schließchecklisten für Küche, Bar und Service.</p></div><div><span class="badge">Vorbereitet</span></div></div>' +
              '</div>' +
            '</div>';
          const openBtn = document.getElementById('btnOpenStaffRatingFromInputs');
          if (openBtn) {
            openBtn.addEventListener('click', function() {
              OPS_STATE.activeTab = 'mitarbeiterbewertung';
              renderActiveOpsTab();
            });
          }
          return;
        }

        if (OPS_STATE.activeTab === 'stats') {
          pane.innerHTML = '<div id="opsSchwundKpiSlot"></div>';
          loadMonthlySummary(session, false, OPS_STATE.selectedPeriod);
          return;
        }

        if (OPS_STATE.activeTab === 'mitarbeiterbewertung') {
          loadRatingTab(session, renderActiveOpsTab);
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
