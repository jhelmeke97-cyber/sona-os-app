'use strict';

(function() {
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

  function openExternalTab(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return false;
  }

  async function loadSchwundOverview(session) {
    const slot = document.getElementById('opsSchwundKpiSlot');
    if (!slot) return;

    try {
      const res = await window.SonaApi.getBestandDashboard(session.standortId, { mode: 'SINGLE_MONTH' }, false);
      if (!res || res.success === false) {
        slot.innerHTML =
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

      const rows = lossItems.slice(0, 8).map(function(it) {
        return '<tr>' +
          '<td><b>' + esc(it.master_ingredient_name || it.master_ingredient_id) + '</b><div style="font-size:10.5px;color:var(--os-silk);">' + esc(it.category || '–') + '</div></td>' +
          '<td class="tabular">' + fmtNum(it.quantity_documented_loss, 2) + ' ' + esc(it.reference_unit || '') + '</td>' +
          '<td class="tabular">' + fmtEur(it.net_value_documented_loss) + '</td>' +
        '</tr>';
      }).join('');

      slot.innerHTML =
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
      slot.innerHTML =
        '<div class="card">' +
          '<div class="kicker">Schwund-Kennzahlen</div>' +
          '<p class="module-desc">Fehler beim Laden der Schwund-Übersicht: ' + esc(err && err.message ? err.message : String(err)) + '</p>' +
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
      const userName = (session && session.user && session.user.name) ? String(session.user.name).trim() : '';
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

      const canSchwundInput = (opTabs === 'ALL') || (Array.isArray(opTabs) && opTabs.indexOf('schwund_eingabe') !== -1);
      const canBruchInput = (opTabs === 'ALL') || (Array.isArray(opTabs) && opTabs.indexOf('bruch_eingabe') !== -1);
      const canSchwundStats = (opTabs === 'ALL' && (accessLevel === 'WRITE' || accessLevel === 'ADMIN' || !!perms.adminMatrix))
        || (Array.isArray(opTabs) && opTabs.indexOf('schwund_auswertung') !== -1);
      const hasBestandAccess = !!(perms.modules && perms.modules.bestand);

      let inputCardsHtml = '';
      if (canSchwundInput) {
        inputCardsHtml +=
          '<div class="module-card">' +
            '<div>' +
              '<div class="kicker">Tagesbetrieb · Separater Tab</div>' +
              '<h3>Schwund-Erfassung</h3>' +
              '<p class="module-desc">Tagesaktuelle Erfassung von Verderb, Überproduktion &amp; Küchen-/Bar-Schwund. Fließt automatisch in Bestand &amp; Warenverbrauch ein.</p>' +
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
              '<p class="module-desc">Schnelle Erfassung von Glas-, Geschirr- und Flaschenbruch im laufenden Service. Direkt synchronisiert mit dem Standort-Sheet.</p>' +
            '</div>' +
            '<div>' +
              (bruchUrl
                ? '<a class="btn btn-primary btn-sm" href="' + esc(bruchUrl) + '" target="_blank" rel="noopener noreferrer" onclick="window.open(this.href, \'_blank\', \'noopener,noreferrer\'); return false;">Im neuen Tab öffnen ↗</a>'
                : '<span class="badge">URL nicht hinterlegt</span>') +
              '<div style="margin-top:8px;font-size:11px;color:var(--os-silk);">Öffnet sich im eigenen Browser-Tab – SONA OS bleibt offen.</div>' +
            '</div>' +
          '</div>';
      }

      let statsSectionHtml = '';
      if (canSchwundStats) {
        if (hasBestandAccess) {
          statsSectionHtml =
            '<div id="opsSchwundKpiSlot" class="pillar-section">' +
              '<div class="card"><div class="kicker">Schwund-Übersicht</div><p class="module-desc">Lade aktuelle Perioden-Kennzahlen und Schwund-Positionen …</p></div>' +
            '</div>';
        } else {
          statsSectionHtml =
            '<div class="card pillar-section">' +
              '<div class="kicker">Schwund-Kennzahlen</div>' +
              '<h3>Bestand-Leserecht erforderlich</h3>' +
              '<p class="module-desc">Aktiviere für diesen Benutzer in der Rechte-Matrix zusätzlich das Modul <b>Bestand</b>, damit die Live-Periodenzahlen und Top-Positionen hier direkt angezeigt werden.</p>' +
            '</div>';
        }
      }

      container.innerHTML =
        '<div class="card">' +
          '<div class="card-head">' +
            '<div>' +
              '<div class="kicker">Operations · ' + esc(session.standortName) + '</div>' +
              '<h3>Operativer Tagesbetrieb</h3>' +
            '</div>' +
            '<span class="badge badge-ok">Vernetzt mit Warenwirtschaft</span>' +
          '</div>' +
          '<p class="module-desc">Separate Erfassungen wie Schwund &amp; Bruch öffnen sich in einem eigenen Browser-Tab, damit dein SONA OS Tab immer geöffnet bleibt. Zugriffe auf Eingabe vs. Schwund-Kennzahlen werden feingranular in der Rechte-Matrix gesteuert.</p>' +
        '</div>' +
        statsSectionHtml +
        (inputCardsHtml
          ? '<div class="pillar-section"><div class="pillar-head"><h3>Operative Erfassung</h3></div><div class="grid-2">' + inputCardsHtml + '</div></div>'
          : '<div class="card pillar-section"><p class="module-desc">Für deinen Zugang sind in Operations aktuell keine Erfassungs-Tabs freigeschaltet.</p></div>') +
        '<div class="pillar-section">' +
          '<div class="pillar-head"><h3>Geplante Operations-Bausteine</h3></div>' +
          '<div class="grid-3">' +
            '<div class="module-card">' +
              '<div><div class="kicker">Operations · Ausbau</div><h3>Gäste-Reklamationen</h3><p class="module-desc">Strukturierte Erfassung von Reklamationen, Ursachen, Kulanz &amp; Auswertung pro Standort.</p></div>' +
              '<div><span class="badge badge-info">Architektur vorbereitet</span></div>' +
            '</div>' +
            '<div class="module-card">' +
              '<div><div class="kicker">Operations · Ausbau</div><h3>Mitarbeiter-Bewertungen</h3><p class="module-desc">Regelmäßige Feedback- &amp; Entwicklungsbögen mit geschütztem Rollenzugriff für Management &amp; Admin.</p></div>' +
              '<div><span class="badge badge-info">Architektur vorbereitet</span></div>' +
            '</div>' +
            '<div class="module-card">' +
              '<div><div class="kicker">Operations · Ausbau</div><h3>Schicht-Checklisten &amp; Übergabe</h3><p class="module-desc">Öffnungs-/Schließroutinen, Hygiene-Checks und digitales Schicht-Übergabeprotokoll.</p></div>' +
              '<div><span class="badge badge-info">Architektur vorbereitet</span></div>' +
            '</div>' +
          '</div>' +
        '</div>';

      if (canSchwundStats && hasBestandAccess) {
        loadSchwundOverview(session);
      }
    }
  };
})();
