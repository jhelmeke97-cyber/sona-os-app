'use strict';

(function() {
  const CACHE_TTL_MS = 180000;
  const REZ_CACHE = {};

  const REZ_STATE = {
    standortId: '',
    standortName: '',
    permissions: null,
    legacyUrl: '',
    adminOnlyLegacy: true,
    data: null,
    activeSubTab: 'recipes',
    selectedHg: 'Alle',
    selectedWg: 'Alle',
    selectedType: 'Alle',
    searchQuery: '',
    sortBy: 'name',
    sortDir: 'asc',
    searchTimer: null
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

  function fmtPctRatio(ratio) {
    if (ratio === null || ratio === undefined || isNaN(Number(ratio))) return '–';
    return (Number(ratio) * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
  }

  function isAdmin() {
    const p = REZ_STATE.permissions || {};
    return !!p.adminMatrix || String(p.accessLevel || '').toUpperCase() === 'ADMIN';
  }

  function canFinance() {
    return !!(REZ_STATE.data && REZ_STATE.data.showFinance);
  }

  function clearCache(standortId) {
    if (!standortId) {
      Object.keys(REZ_CACHE).forEach(k => delete REZ_CACHE[k]);
      return;
    }
    delete REZ_CACHE[standortId];
  }

  function notify(msg) {
    if (window.SonaApp && typeof window.SonaApp.toast === 'function') {
      window.SonaApp.toast(msg);
    }
  }

  function renderKpis(d) {
    const list = Array.isArray(d.rezepturen) ? d.rezepturen : [];
    const active = list.filter(r => r.aktiv);
    const ep = list.filter(r => r.istZwischenprodukt);
    const tasks = Array.isArray(d.workflowAufgaben) ? d.workflowAufgaben : [];
    const wgStats = Array.isArray(d.warengruppenStatistik) ? d.warengruppenStatistik : [];

    let avgWeHtml = '<div class="bv-kpi-card"><div class="kicker">Ansichtsmodus</div><div class="bv-kpi-val">Rezept-Ansicht</div><span class="bv-delta">Zutaten &amp; Zubereitung</span></div>';
    if (d.showFinance) {
      const weItems = active.filter(r => !r.istZwischenprodukt && r.weQuote > 0);
      const avgWe = weItems.length ? (weItems.reduce((s, x) => s + x.weQuote, 0) / weItems.length) : 0;
      avgWeHtml = '<div class="bv-kpi-card"><div class="kicker">Ø WE-Quote (Aktiv)</div><div class="bv-kpi-val tabular">' + fmtPctRatio(avgWe) + '</div><span class="bv-delta">Masterzutaten: ' + esc(d.masterZutatenCount || 0) + '</span></div>';
    }

    return '<div class="bv-kpi-grid">' +
      '<div class="bv-kpi-card"><div class="kicker">Rezepturen gesamt</div><div class="bv-kpi-val tabular">' + esc(list.length) + '</div><span class="bv-delta">Aktiv: ' + esc(active.length) + '</span></div>' +
      '<div class="bv-kpi-card"><div class="kicker">Eigenproduktionen</div><div class="bv-kpi-val tabular">' + esc(ep.length) + '</div><span class="bv-delta">Zwischenprodukte</span></div>' +
      '<div class="bv-kpi-card"><div class="kicker">Warengruppen</div><div class="bv-kpi-val tabular">' + esc(wgStats.length) + '</div><span class="bv-delta">Standort ' + esc(REZ_STATE.standortId) + '</span></div>' +
      '<div class="bv-kpi-card"><div class="kicker">Offene Aufgaben</div><div class="bv-kpi-val tabular">' + esc(tasks.length) + '</div><span class="bv-delta">Workflow</span></div>' +
      avgWeHtml +
      '<div class="bv-kpi-card"><div class="kicker">Zugang</div><div class="bv-kpi-val">SONA OS</div><span class="bv-delta">Zentraler Single-Sign-On</span></div>' +
    '</div>';
  }

  function renderRecipesTab(d) {
    const q = REZ_STATE.searchQuery.trim().toLowerCase();
    const list = (d.rezepturen || []).filter(r => {
      if (REZ_STATE.selectedHg !== 'Alle' && r.hauptgruppe !== REZ_STATE.selectedHg) return false;
      if (REZ_STATE.selectedWg !== 'Alle' && r.warengruppe !== REZ_STATE.selectedWg) return false;
      if (REZ_STATE.selectedType === 'EP' && !r.istZwischenprodukt) return false;
      if (REZ_STATE.selectedType === 'VK' && r.istZwischenprodukt) return false;
      if (q) {
        const hay = [r.id, r.artikelNummer, r.name, r.warengruppe, r.hauptgruppe].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    const key = REZ_STATE.sortBy;
    const dir = REZ_STATE.sortDir === 'asc' ? 1 : -1;
    const sorted = list.slice().sort((a, b) => {
      const va = a[key];
      const vb = b[key];
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va || '').localeCompare(String(vb || ''), 'de') * dir;
      }
      return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
    });

    const fin = canFinance();
    const arrow = col => REZ_STATE.sortBy === col ? (REZ_STATE.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    const cols = fin ? 7 : 5;

    const rows = sorted.length
      ? sorted.slice(0, 200).map(r =>
          '<tr class="clickable-row" data-rid="' + esc(r.id) + '">' +
            '<td><b>' + esc(r.name || r.id) + '</b><div style="font-size:10.5px;color:var(--os-silk);">' + esc(r.id) + (r.artikelNummer ? ' · #' + esc(r.artikelNummer) : '') + '</div></td>' +
            '<td>' + esc(r.warengruppe || r.hauptgruppe || '–') + '</td>' +
            '<td>' + (r.istZwischenprodukt ? '<span class="badge badge-info">Eigenproduktion</span>' : '<span class="badge">Verkauf</span>') + '</td>' +
            '<td class="tabular">' + fmtNum(r.ausgabeGroesse, 2) + ' ' + esc(r.ausgabeEinheit || '') + '</td>' +
            (fin
              ? '<td class="tabular">' + fmtEur(r.kostenPortion) + '</td>' +
                '<td class="tabular">' + fmtEur(r.vkBrutto) + ' · ' + fmtPctRatio(r.weQuote) + '</td>'
              : '') +
            '<td>' + (r.aktiv ? '<span class="badge badge-ok">AKTIV</span>' : '<span class="badge badge-warn">INAKTIV</span>') + '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="' + cols + '">Keine Rezepturen für den gewählten Filter.</td></tr>';

    return '<div class="card">' +
      '<div class="card-head"><div><div class="kicker">Rezepturen &amp; Eigenproduktion</div><h3>Katalog (' + esc(sorted.length) + ')</h3></div><span class="kicker">Klick auf Zeile öffnet Rezeptkarte</span></div>' +
      '<div class="table-wrap"><table id="rezTable"><thead><tr>' +
        '<th class="bv-sort" data-col="name">Rezeptur' + arrow('name') + '</th>' +
        '<th class="bv-sort" data-col="warengruppe">Warengruppe' + arrow('warengruppe') + '</th>' +
        '<th>Typ</th>' +
        '<th>Ausgabe</th>' +
        (fin
          ? '<th class="bv-sort" data-col="kostenPortion">Kosten/Port.' + arrow('kostenPortion') + '</th>' +
            '<th class="bv-sort" data-col="weQuote">VK / WE-Quote' + arrow('weQuote') + '</th>'
          : '') +
        '<th>Status</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '</div>';
  }

  function renderWgStatsTab(d) {
    const list = Array.isArray(d.warengruppenStatistik) ? d.warengruppenStatistik : [];
    const fin = canFinance();
    const rows = list.length
      ? list.map(w =>
          '<tr>' +
            '<td><b>' + esc(w.warengruppe) + '</b><div style="font-size:10.5px;color:var(--os-silk);">' + esc(w.hauptgruppe) + '</div></td>' +
            '<td class="tabular">' + esc(w.rezepturAnzahl) + ' (' + esc(w.aktiveAnzahl) + ' aktiv)</td>' +
            '<td class="tabular">' + esc(w.eigenproduktionAnzahl) + '</td>' +
            (fin
              ? '<td class="tabular">' + fmtEur(w.schnittPortionskosten) + '</td>' +
                '<td class="tabular">' + fmtEur(w.schnittVkBrutto) + '</td>' +
                '<td class="tabular">' + fmtPctRatio(w.schnittWeQuote) + '</td>'
              : '') +
            '<td><span class="badge">' + esc(w.status || 'OK') + '</span></td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="' + (fin ? 7 : 4) + '">Keine Warengruppen-Statistik vorhanden.</td></tr>';

    return '<div class="card">' +
      '<div class="card-head"><div><div class="kicker">Struktur</div><h3>Warengruppen-Übersicht</h3></div></div>' +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>Warengruppe</th><th>Rezepturen</th><th>Eigenprod.</th>' +
        (fin ? '<th>Ø Kosten</th><th>Ø VK Brutto</th><th>Ø WE-Quote</th>' : '') +
        '<th>Status</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '</div>';
  }

  function renderTasksTab(d) {
    const tasks = Array.isArray(d.workflowAufgaben) ? d.workflowAufgaben : [];
    const rows = tasks.length
      ? tasks.map(t =>
          '<tr>' +
            '<td><b>' + esc(t.titel || t.rezepturName || t.beschreibung || 'Aufgabe') + '</b></td>' +
            '<td>' + esc(t.bereich || t.kategorie || '–') + '</td>' +
            '<td>' + esc(t.prioritaet || 'MITTEL') + '</td>' +
            '<td><span class="badge badge-warn">' + esc(t.status || 'OFFEN') + '</span></td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="4">Aktuell keine offenen Workflow-Aufgaben.</td></tr>';

    return '<div class="card">' +
      '<div class="card-head"><div><div class="kicker">Team-Workflow</div><h3>Aufgaben (' + esc(tasks.length) + ')</h3></div></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Aufgabe</th><th>Bereich</th><th>Priorität</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '</div>';
  }

  function closeRezModal() {
    const existing = document.getElementById('rezDetailModal');
    if (existing) existing.remove();
  }

  async function openRecipeDetailModal(rezepturId) {
    closeRezModal();
    const modal = document.createElement('div');
    modal.id = 'rezDetailModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML =
      '<div class="modal-card bv-modal-wide">' +
        '<div class="card-head">' +
          '<div><div class="kicker">Rezeptkarte · ' + esc(REZ_STATE.standortName) + '</div><h3 id="rezDetailTitle">' + esc(rezepturId) + '</h3></div>' +
          '<button type="button" class="btn btn-sm" id="rezModalCloseBtn">Schließen</button>' +
        '</div>' +
        '<div id="rezDetailBody"><p class="module-desc">Lade Rezeptkarte …</p></div>' +
      '</div>';
    document.body.appendChild(modal);
    document.getElementById('rezModalCloseBtn').addEventListener('click', closeRezModal);
    modal.addEventListener('click', ev => { if (ev.target === modal) closeRezModal(); });

    try {
      const res = await window.SonaApi.getRezepturDetail(REZ_STATE.standortId, rezepturId);
      const body = document.getElementById('rezDetailBody');
      if (!body) return;
      if (!res || res.success === false || !res.kopf) {
        body.innerHTML = '<p class="module-desc">' + esc((res && res.error) || 'Rezeptkarte konnte nicht geladen werden.') + '</p>';
        return;
      }

      const k = res.kopf;
      const pos = Array.isArray(res.positionen) ? res.positionen : [];
      const fin = !!res.showFinance;
      document.getElementById('rezDetailTitle').textContent = (k.name || rezepturId) + ' (' + rezepturId + ')';

      const kpiBlock = fin
        ? '<div class="grid-3" style="margin-bottom:14px;">' +
            '<div class="bv-kpi-card"><div class="kicker">Portionskosten</div><div class="bv-kpi-val tabular">' + fmtEur(k.kostenPortion) + '</div></div>' +
            '<div class="bv-kpi-card"><div class="kicker">VK Brutto / WE-Quote</div><div class="bv-kpi-val tabular">' + fmtEur(k.vkBrutto) + ' · ' + fmtPctRatio(k.weQuote) + '</div></div>' +
            '<div class="bv-kpi-card"><div class="kicker">Deckungsbeitrag</div><div class="bv-kpi-val tabular">' + fmtEur(k.db) + '</div></div>' +
          '</div>'
        : '<div class="grid-2" style="margin-bottom:14px;">' +
            '<div class="bv-kpi-card"><div class="kicker">Warengruppe</div><div class="bv-kpi-val">' + esc(k.warengruppe || '–') + '</div></div>' +
            '<div class="bv-kpi-card"><div class="kicker">Ausgabe</div><div class="bv-kpi-val tabular">' + fmtNum(k.ausgabeGroesse, 2) + ' ' + esc(k.ausgabeEinheit || '') + '</div></div>' +
          '</div>';

      const posRows = pos.length
        ? pos.map(p =>
            '<tr>' +
              '<td class="tabular">' + esc(p.posNr) + '</td>' +
              '<td><b>' + esc(p.zutatName) + '</b></td>' +
              '<td class="tabular">' + fmtNum(p.nettoMenge, 3) + ' ' + esc(p.einheit) + '</td>' +
              '<td class="tabular">' + fmtNum(p.bruttoMenge, 3) + ' ' + esc(p.einheit) + '</td>' +
              (fin ? '<td class="tabular">' + fmtEur(p.gesamtKosten) + '</td>' : '') +
              '<td>' + esc(p.bemerkung || '–') + '</td>' +
            '</tr>'
          ).join('')
        : '<tr><td colspan="' + (fin ? 6 : 5) + '">Keine Zutatenpositionen hinterlegt.</td></tr>';

      body.innerHTML =
        kpiBlock +
        (k.bemerkung ? '<p class="module-desc" style="margin-bottom:12px;"><b>Hinweis:</b> ' + esc(k.bemerkung) + '</p>' : '') +
        '<div class="kicker" style="margin:8px 0 6px;">Zutatenliste (' + esc(pos.length) + ' Positionen)</div>' +
        '<div class="table-wrap"><table><thead><tr>' +
          '<th>#</th><th>Zutat</th><th>Netto-Menge</th><th>Brutto-Menge</th>' +
          (fin ? '<th>Kosten</th>' : '') +
          '<th>Bemerkung</th>' +
        '</tr></thead><tbody>' + posRows + '</tbody></table></div>';
    } catch (err) {
      const body = document.getElementById('rezDetailBody');
      if (body) body.innerHTML = '<p class="module-desc">Fehler: ' + esc(err.message) + '</p>';
    }
  }

  function renderSubTab() {
    const slot = document.getElementById('rezSubTabContent');
    const d = REZ_STATE.data;
    if (!slot || !d) return;

    document.querySelectorAll('#rezSubTabs .bv-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === REZ_STATE.activeSubTab);
    });

    if (REZ_STATE.activeSubTab === 'recipes') {
      slot.innerHTML = renderRecipesTab(d);
      const tbl = document.getElementById('rezTable');
      if (tbl) {
        tbl.querySelectorAll('th.bv-sort').forEach(th => {
          th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (REZ_STATE.sortBy === col) {
              REZ_STATE.sortDir = REZ_STATE.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
              REZ_STATE.sortBy = col;
              REZ_STATE.sortDir = (col === 'name' || col === 'warengruppe') ? 'asc' : 'desc';
            }
            renderSubTab();
          });
        });
        tbl.querySelectorAll('tbody tr.clickable-row').forEach(tr => {
          tr.addEventListener('click', () => {
            if (tr.dataset.rid) openRecipeDetailModal(tr.dataset.rid);
          });
        });
      }
    } else if (REZ_STATE.activeSubTab === 'wg') {
      slot.innerHTML = renderWgStatsTab(d);
    } else if (REZ_STATE.activeSubTab === 'tasks') {
      slot.innerHTML = renderTasksTab(d);
    }
  }

  function renderFullView(container) {
    const d = REZ_STATE.data;
    if (!d) return;

    const hgs = ['Alle'].concat(d.hauptgruppen || []);
    const wgs = ['Alle'].concat(d.warengruppen || []);

    container.innerHTML =
      '<div class="card bv-toolbar-card">' +
        '<div class="bv-toolbar">' +
          '<div class="bv-toolbar-group">' +
            '<select id="rezHgSelect" class="input-control bv-ctrl" aria-label="Hauptgruppe">' +
              hgs.map(h => '<option value="' + esc(h) + '"' + (h === REZ_STATE.selectedHg ? ' selected' : '') + '>' + esc(h === 'Alle' ? 'Alle Hauptgruppen' : h) + '</option>').join('') +
            '</select>' +
            '<select id="rezWgSelect" class="input-control bv-ctrl" aria-label="Warengruppe">' +
              wgs.map(w => '<option value="' + esc(w) + '"' + (w === REZ_STATE.selectedWg ? ' selected' : '') + '>' + esc(w === 'Alle' ? 'Alle Warengruppen' : w) + '</option>').join('') +
            '</select>' +
            '<select id="rezTypeSelect" class="input-control bv-ctrl" aria-label="Typ">' +
              '<option value="Alle"' + (REZ_STATE.selectedType === 'Alle' ? ' selected' : '') + '>Alle Typen</option>' +
              '<option value="VK"' + (REZ_STATE.selectedType === 'VK' ? ' selected' : '') + '>Verkaufsrezepte</option>' +
              '<option value="EP"' + (REZ_STATE.selectedType === 'EP' ? ' selected' : '') + '>Eigenproduktionen</option>' +
            '</select>' +
            '<input id="rezSearchInput" type="search" class="input-control bv-ctrl" placeholder="Rezeptur suchen …" value="' + esc(REZ_STATE.searchQuery) + '">' +
          '</div>' +
          '<div class="bv-toolbar-group">' +
            '<button type="button" class="btn btn-sm" id="rezBtnRefresh">Aktualisieren</button>' +
            (canFinance() ? '<button type="button" class="btn btn-primary btn-sm" id="rezBtnSync">Master-Sync</button>' : '') +
            (isAdmin() && REZ_STATE.legacyUrl ? '<a class="btn btn-sm" href="' + esc(REZ_STATE.legacyUrl) + '" target="_blank" rel="noopener">Admin-Vollansicht ↗</a>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
      renderKpis(d) +
      '<div id="rezSubTabs" class="bv-subtabs">' +
        '<button type="button" class="bv-tab-btn" data-tab="recipes">Rezepturen &amp; Eigenproduktion</button>' +
        '<button type="button" class="bv-tab-btn" data-tab="wg">Warengruppen</button>' +
        '<button type="button" class="bv-tab-btn" data-tab="tasks">Aufgaben (' + esc((d.workflowAufgaben || []).length) + ')</button>' +
      '</div>' +
      '<div id="rezSubTabContent"></div>';

    document.getElementById('rezHgSelect').addEventListener('change', ev => { REZ_STATE.selectedHg = ev.target.value; renderSubTab(); });
    document.getElementById('rezWgSelect').addEventListener('change', ev => { REZ_STATE.selectedWg = ev.target.value; renderSubTab(); });
    document.getElementById('rezTypeSelect').addEventListener('change', ev => { REZ_STATE.selectedType = ev.target.value; renderSubTab(); });
    document.getElementById('rezSearchInput').addEventListener('input', ev => {
      REZ_STATE.searchQuery = ev.target.value;
      if (REZ_STATE.searchTimer) clearTimeout(REZ_STATE.searchTimer);
      REZ_STATE.searchTimer = setTimeout(() => renderSubTab(), 240);
    });
    document.getElementById('rezBtnRefresh').addEventListener('click', () => {
      clearCache(REZ_STATE.standortId);
      loadOverview(true);
    });

    const syncBtn = document.getElementById('rezBtnSync');
    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Synchronisiert…';
        window.SonaLoader.show(900);
        try {
          const res = await window.SonaApi.syncRezepturMasters(REZ_STATE.standortId);
          if (!res || res.success === false) {
            notify('Master-Sync fehlgeschlagen: ' + ((res && res.error) || 'Unbekannter Fehler'));
          } else {
            clearCache(REZ_STATE.standortId);
            notify('Masterzutaten aus Einkauf synchronisiert.');
            await loadOverview(true);
          }
        } catch (err) {
          notify('Sync-Fehler: ' + err.message);
        } finally {
          window.SonaLoader.hide();
          syncBtn.disabled = false;
          syncBtn.textContent = 'Master-Sync';
        }
      });
    }

    document.getElementById('rezSubTabs').addEventListener('click', ev => {
      const btn = ev.target.closest('button[data-tab]');
      if (!btn) return;
      REZ_STATE.activeSubTab = btn.dataset.tab;
      renderSubTab();
    });

    renderSubTab();
  }

  async function loadOverview(forceRefresh) {
    const container = document.getElementById('osMainContent');
    if (!container) return;

    const hit = !forceRefresh && REZ_CACHE[REZ_STATE.standortId];
    if (hit && (Date.now() - hit.ts) < CACHE_TTL_MS) {
      REZ_STATE.data = hit.data;
      renderFullView(container);
      return;
    }

    container.innerHTML = '<div class="card"><div class="kicker">Ebene 1 · ' + esc(REZ_STATE.standortName) + '</div><h3>Lade Rezeptur-Manager …</h3><p class="module-desc">Rezepturen &amp; Eigenproduktionen werden zentral über SONA OS geladen.</p></div>';
    window.SonaLoader.show(900);
    try {
      const res = await window.SonaApi.getRezepturOverview(REZ_STATE.standortId, forceRefresh);
      if (!res || res.success === false) {
        container.innerHTML = '<div class="card"><div class="kicker">Ebene 1 · Fehler</div><h3>Rezeptur-Manager konnte nicht geladen werden</h3><p class="module-desc">' + esc((res && res.error) || 'Unbekannter Fehler') + '</p></div>';
        return;
      }
      REZ_STATE.data = res;
      REZ_CACHE[REZ_STATE.standortId] = { ts: Date.now(), data: res };
      renderFullView(container);
    } catch (err) {
      container.innerHTML = '<div class="card"><div class="kicker">Verbindungsfehler</div><h3>Gateway nicht erreichbar</h3><p class="module-desc">' + esc(err.message) + '</p></div>';
    } finally {
      window.SonaLoader.hide();
    }
  }

  window.SonaRezepturModule = {
    mount: function(session, mod) {
      const changedLoc = REZ_STATE.standortId !== session.standortId;
      REZ_STATE.standortId = session.standortId;
      REZ_STATE.standortName = session.standortName;
      REZ_STATE.permissions = session.permissions;
      REZ_STATE.legacyUrl = (mod && mod.legacyUrl) || '';
      REZ_STATE.adminOnlyLegacy = !!(mod && mod.adminOnlyLegacy);
      if (changedLoc) {
        REZ_STATE.selectedHg = 'Alle';
        REZ_STATE.selectedWg = 'Alle';
        REZ_STATE.selectedType = 'Alle';
        REZ_STATE.searchQuery = '';
      }
      return loadOverview(false);
    },
    clearCache: clearCache
  };
})();
