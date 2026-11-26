'use strict';

(function() {
  const CACHE_TTL_MS = 180000;
  const META_CACHE = {};
  const DATA_CACHE = {};

  const CTRL_STATE = {
    standortId: '',
    standortName: '',
    legacyUrl: '',
    meta: null,
    status: 'AKTIV',
    statusMessage: '',
    activeSubTab: 'GESAMT',
    periodeId: '',
    vergleichId: 'VORPERIODE',
    hauptgruppe: 'ALLE',
    searchQuery: '',
    sortBy: 'umsatz',
    sortDir: 'desc',
    currentData: null,
    prognoseMeta: null,
    prognoseResult: null,
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
    const d = digits !== undefined ? digits : 0;
    return Number(val).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function fmtPctRatio(ratio) {
    if (ratio === null || ratio === undefined || isNaN(Number(ratio))) return '–';
    return (Number(ratio) * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
  }

  function fmtDeltaRatio(ratio, invertGood) {
    if (ratio === null || ratio === undefined || isNaN(Number(ratio))) {
      return '<span class="bv-delta">Vergleich: –</span>';
    }
    const pct = Number(ratio) * 100;
    const sign = pct > 0 ? '+' : '';
    const isGood = invertGood ? pct < 0 : pct > 0;
    const isBad = invertGood ? pct > 0 : pct < 0;
    const cls = isGood ? 'bv-delta-down' : (isBad ? 'bv-delta-up' : '');
    return '<span class="bv-delta ' + cls + '">' + sign + pct.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' % vs. Vergleich</span>';
  }

  function clearCache(standortId) {
    if (!standortId) {
      Object.keys(META_CACHE).forEach(k => delete META_CACHE[k]);
      Object.keys(DATA_CACHE).forEach(k => delete DATA_CACHE[k]);
      return;
    }
    delete META_CACHE[standortId];
    const prefix = String(standortId) + '::';
    Object.keys(DATA_CACHE).forEach(k => {
      if (k.indexOf(prefix) === 0) delete DATA_CACHE[k];
    });
  }

  function notify(msg) {
    if (window.SonaApp && typeof window.SonaApp.toast === 'function') {
      window.SonaApp.toast(msg);
    }
  }

  function renderKpis(d) {
    const g = (d && d.gesamt) || {};
    const ent = (d && d.gesamtEntwicklung) || {};
    return '<div class="bv-kpi-grid">' +
      '<div class="bv-kpi-card">' +
        '<div class="kicker">Netto-Umsatz</div>' +
        '<div class="bv-kpi-val tabular">' + fmtEur(g.umsatz) + '</div>' +
        fmtDeltaRatio(ent.umsatz, false) +
      '</div>' +
      '<div class="bv-kpi-card">' +
        '<div class="kicker">Deckungsbeitrag (DB)</div>' +
        '<div class="bv-kpi-val tabular">' + fmtEur(g.db) + '</div>' +
        '<span class="bv-delta">DB-Quote: <b>' + fmtPctRatio(g.dbQuote) + '</b></span>' +
      '</div>' +
      '<div class="bv-kpi-card">' +
        '<div class="kicker">Wareneinsatz (WE)</div>' +
        '<div class="bv-kpi-val tabular">' + fmtEur(g.wareneinsatz) + '</div>' +
        '<span class="bv-delta">WE-Quote: <b>' + fmtPctRatio(g.weQuote) + '</b></span>' +
      '</div>' +
      '<div class="bv-kpi-card">' +
        '<div class="kicker">Cover / Gäste</div>' +
        '<div class="bv-kpi-val tabular">' + fmtNum(g.cover, 0) + '</div>' +
        '<span class="bv-delta">Ø ' + fmtNum(g.coverProTag, 1) + ' Cover/Tag</span>' +
      '</div>' +
      '<div class="bv-kpi-card">' +
        '<div class="kicker">Umsatz pro Gast</div>' +
        '<div class="bv-kpi-val tabular">' + fmtEur(g.umsatzProGast) + '</div>' +
        fmtDeltaRatio(ent.umsatzProGast, false) +
      '</div>' +
      '<div class="bv-kpi-card">' +
        '<div class="kicker">DB pro Gast</div>' +
        '<div class="bv-kpi-val tabular">' + fmtEur(g.dbProGast) + '</div>' +
        fmtDeltaRatio(ent.dbProGast, false) +
      '</div>' +
    '</div>';
  }

  function renderGesamtTab(d) {
    const rp = (d && d.rennerPenner && d.rennerPenner.aktuell) || {};
    const topUmsatz = Array.isArray(rp.topUmsatz) ? rp.topUmsatz : (Array.isArray(rp.renner) ? rp.renner : []);
    const flopUmsatz = Array.isArray(rp.flopUmsatz) ? rp.flopUmsatz : (Array.isArray(rp.penner) ? rp.penner : []);
    const chart = (d && d.gesamtChartData) || {};
    const labels = Array.isArray(chart.labels) ? chart.labels : [];
    const umsatzArr = Array.isArray(chart.umsatz) ? chart.umsatz : [];
    const dbArr = Array.isArray(chart.db) ? chart.db : [];
    const coverArr = Array.isArray(chart.cover) ? chart.cover : [];

    const rpRow = list => list.length
      ? list.slice(0, 8).map(item =>
          '<tr>' +
            '<td><b>' + esc(item.artikel || item.warengruppe || item.name || '–') + '</b></td>' +
            '<td class="tabular">' + fmtNum(item.absatz, 0) + '</td>' +
            '<td class="tabular">' + fmtEur(item.umsatz) + '</td>' +
            '<td class="tabular">' + fmtEur(item.db) + '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="4">Keine Daten in dieser Periode.</td></tr>';

    const timelineRows = labels.length
      ? labels.map((lbl, idx) =>
          '<tr>' +
            '<td><b>' + esc(lbl) + '</b></td>' +
            '<td class="tabular">' + fmtEur(umsatzArr[idx]) + '</td>' +
            '<td class="tabular">' + fmtEur(dbArr[idx]) + '</td>' +
            '<td class="tabular">' + fmtNum(coverArr[idx], 0) + '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="4">Keine Verlaufsdaten vorhanden.</td></tr>';

    return '<div class="grid-2" style="margin-bottom:16px;">' +
      '<div class="card">' +
        '<div class="card-head"><div><div class="kicker">Top-Performer</div><h3>Renner (Umsatz / DB)</h3></div></div>' +
        '<div class="table-wrap"><table><thead><tr><th>Position</th><th>Absatz</th><th>Umsatz</th><th>DB</th></tr></thead><tbody>' + rpRow(topUmsatz) + '</tbody></table></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-head"><div><div class="kicker">Prüfkandidaten</div><h3>Penner (Niedrigster Beitrag)</h3></div></div>' +
        '<div class="table-wrap"><table><thead><tr><th>Position</th><th>Absatz</th><th>Umsatz</th><th>DB</th></tr></thead><tbody>' + rpRow(flopUmsatz) + '</tbody></table></div>' +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-head"><div><div class="kicker">Jahresverlauf</div><h3>Perioden-Übersicht</h3></div></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Periode</th><th>Netto-Umsatz</th><th>Deckungsbeitrag</th><th>Cover</th></tr></thead><tbody>' + timelineRows + '</tbody></table></div>' +
    '</div>';
  }

  function renderRowsTab(d, isArtikel) {
    const rawRows = Array.isArray(d && d.rows) ? d.rows : [];
    const q = CTRL_STATE.searchQuery.trim().toLowerCase();
    const filtered = rawRows.filter(r => {
      if (!q) return true;
      const hay = [r.artikel, r.warengruppe, r.hauptgruppe, r.kategorie].join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });

    const key = CTRL_STATE.sortBy;
    const dir = CTRL_STATE.sortDir === 'asc' ? 1 : -1;
    const sorted = filtered.slice().sort((a, b) => {
      const va = a[key];
      const vb = b[key];
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va || '').localeCompare(String(vb || ''), 'de') * dir;
      }
      return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
    });

    const arrow = col => CTRL_STATE.sortBy === col ? (CTRL_STATE.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    const titleCol = isArtikel ? 'artikel' : 'warengruppe';

    const rowsHtml = sorted.length
      ? sorted.slice(0, 150).map(r =>
          '<tr>' +
            '<td><b>' + esc(isArtikel ? r.artikel : r.warengruppe) + '</b><div style="font-size:10.5px;color:var(--os-silk);">' + esc(isArtikel ? (r.warengruppe || r.hauptgruppe || '') : (r.hauptgruppe || '')) + '</div></td>' +
            '<td class="tabular">' + fmtNum(r.absatz, 0) + '</td>' +
            '<td class="tabular">' + fmtEur(r.umsatz) + '</td>' +
            '<td class="tabular">' + fmtEur(r.db) + '</td>' +
            '<td class="tabular">' + fmtPctRatio(r.dbQuote) + '</td>' +
            '<td class="tabular">' + fmtPctRatio(r.weQuote) + '</td>' +
            '<td class="tabular">' + (r.entwicklung && r.entwicklung.umsatz !== null && r.entwicklung.umsatz !== undefined ? fmtDeltaRatio(r.entwicklung.umsatz, false) : '–') + '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="7">Keine Einträge für den gewählten Filter.</td></tr>';

    return '<div class="card">' +
      '<div class="card-head">' +
        '<div><div class="kicker">' + (isArtikel ? 'Artikelebene' : 'Warengruppenebene') + '</div><h3>' + (isArtikel ? 'Artikelanalyse' : 'Warengruppenanalyse') + ' (' + esc(sorted.length) + ')</h3></div>' +
        '<span class="kicker">Klick auf Spalte zum Sortieren</span>' +
      '</div>' +
      '<div class="table-wrap"><table id="ctrlRowsTable"><thead><tr>' +
        '<th class="bv-sort" data-col="' + titleCol + '">' + (isArtikel ? 'Artikel' : 'Warengruppe') + arrow(titleCol) + '</th>' +
        '<th class="bv-sort" data-col="absatz">Absatz' + arrow('absatz') + '</th>' +
        '<th class="bv-sort" data-col="umsatz">Netto-Umsatz' + arrow('umsatz') + '</th>' +
        '<th class="bv-sort" data-col="db">DB' + arrow('db') + '</th>' +
        '<th class="bv-sort" data-col="dbQuote">DB-Quote' + arrow('dbQuote') + '</th>' +
        '<th class="bv-sort" data-col="weQuote">WE-Quote' + arrow('weQuote') + '</th>' +
        '<th>Umsatz-Trend</th>' +
      '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
    '</div>';
  }

  async function renderPrognoseTab(slot) {
    slot.innerHTML = '<div class="card"><div class="kicker">Preis- &amp; Nachfrageprognose</div><h3>Lade Prognose-Artikel …</h3></div>';
    if (!CTRL_STATE.prognoseMeta) {
      window.SonaLoader.show(800);
      try {
        const res = await window.SonaApi.getControllingPrognoseMeta(CTRL_STATE.standortId);
        if (!res || res.success === false) {
          slot.innerHTML = '<div class="card"><p class="module-desc">' + esc((res && res.error) || 'Prognose-Stammdaten nicht verfügbar.') + '</p></div>';
          return;
        }
        CTRL_STATE.prognoseMeta = res.meta || {};
      } catch (err) {
        slot.innerHTML = '<div class="card"><p class="module-desc">Fehler: ' + esc(err.message) + '</p></div>';
        return;
      } finally {
        window.SonaLoader.hide();
      }
    }

    const arts = (CTRL_STATE.prognoseMeta && CTRL_STATE.prognoseMeta.artikel) || [];
    slot.innerHTML =
      '<div class="card">' +
        '<div class="card-head"><div><div class="kicker">Cover-bereinigte Preiselastizität</div><h3>Preis- &amp; Deckungsbeitrags-Prognose</h3></div></div>' +
        '<div class="bv-toolbar" style="margin-bottom:14px;">' +
          '<div class="bv-toolbar-group" style="flex:1;">' +
            '<select id="ctrlProgArtikel" class="input-control bv-ctrl" style="min-width:240px;">' +
              (arts.length
                ? arts.map(a => '<option value="' + esc(a.artikelschluessel) + '" data-vk="' + esc(a.letzterVKBrutto || '') + '">' + esc(a.artikel) + ' (' + esc(a.warengruppe) + ' · akt. ' + fmtEur(a.letzterVKBrutto) + ')</option>').join('')
                : '<option value="">Keine Artikel mit ausreichender Preishistorie</option>') +
            '</select>' +
            '<input id="ctrlProgPreis" type="number" step="0.10" min="0.50" class="input-control bv-ctrl" placeholder="Ziel-Brutto-VK (€)">' +
            '<select id="ctrlProgHorizont" class="input-control bv-ctrl">' +
              '<option value="kurz">Kurzfristig</option>' +
              '<option value="mittel" selected>Mittelfristig</option>' +
              '<option value="lang">Langfristig</option>' +
            '</select>' +
            '<button type="button" class="btn btn-primary btn-sm" id="ctrlProgCalcBtn">Prognose berechnen</button>' +
          '</div>' +
        '</div>' +
        '<div id="ctrlProgOutput"><p class="module-desc">Wähle einen Artikel und gib einen Ziel-Brutto-VK ein, um Absatz-, Umsatz- und DB-Szenarien zu simulieren.</p></div>' +
      '</div>';

    const artSel = document.getElementById('ctrlProgArtikel');
    const preisInp = document.getElementById('ctrlProgPreis');
    if (artSel && preisInp && artSel.selectedOptions[0]) {
      preisInp.value = artSel.selectedOptions[0].dataset.vk || '';
      artSel.addEventListener('change', () => {
        if (artSel.selectedOptions[0]) preisInp.value = artSel.selectedOptions[0].dataset.vk || '';
      });
    }

    document.getElementById('ctrlProgCalcBtn').addEventListener('click', async () => {
      const key = artSel.value;
      const bruttoPreis = parseFloat(preisInp.value);
      const zeithorizont = document.getElementById('ctrlProgHorizont').value;
      const out = document.getElementById('ctrlProgOutput');
      if (!key || !bruttoPreis || bruttoPreis <= 0) {
        notify('Bitte Artikel und gültigen Brutto-VK eingeben.');
        return;
      }
      window.SonaLoader.show(800);
      try {
        const res = await window.SonaApi.calcControllingPrognose(CTRL_STATE.standortId, {
          artikelschluessel: key,
          bruttoPreis: bruttoPreis,
          zeithorizont: zeithorizont
        });
        if (!res || res.success === false || !res.data) {
          out.innerHTML = '<p class="module-desc">' + esc((res && res.error) || 'Prognose konnte nicht berechnet werden.') + '</p>';
          return;
        }
        const p = res.data.prognose || {};
        const opt = res.data.gewinnmaximierung || {};
        const szen = Array.isArray(res.data.szenarien) ? res.data.szenarien : [];

        out.innerHTML =
          '<div class="grid-3" style="margin-bottom:14px;">' +
            '<div class="bv-kpi-card"><div class="kicker">Prognose Absatz</div><div class="bv-kpi-val tabular">' + fmtNum(p.absatz, 0) + ' Stk.</div><span class="bv-delta">Basis: ' + fmtNum(p.basis && p.basis.absatz, 0) + ' Stk.</span></div>' +
            '<div class="bv-kpi-card"><div class="kicker">Prognose Netto-Umsatz</div><div class="bv-kpi-val tabular">' + fmtEur(p.umsatzNetto) + '</div><span class="bv-delta">Basis: ' + fmtEur(p.basis && p.basis.umsatzNetto) + '</span></div>' +
            '<div class="bv-kpi-card"><div class="kicker">Prognose Deckungsbeitrag</div><div class="bv-kpi-val tabular">' + fmtEur(p.deckungsbeitrag) + '</div><span class="bv-delta">' + (opt.verfuegbar ? 'DB-Optimum: ' + fmtEur(opt.optimalerPreisBrutto) : esc(opt.grund || '')) + '</span></div>' +
          '</div>' +
          (szen.length
            ? '<div class="table-wrap"><table><thead><tr><th>Brutto-VK</th><th>Absatz</th><th>Umsatz Netto</th><th>DB / Stk.</th><th>Gesamt-DB</th></tr></thead><tbody>' +
              szen.map(s => '<tr' + (s.istOptimum ? ' style="background:rgba(169,223,191,0.08);"' : '') + '><td class="tabular"><b>' + fmtEur(s.preisBrutto) + (s.istOptimum ? ' ★' : '') + '</b></td><td class="tabular">' + fmtNum(s.absatz, 0) + '</td><td class="tabular">' + fmtEur(s.umsatzNetto) + '</td><td class="tabular">' + fmtEur(s.dbJeStueck) + '</td><td class="tabular">' + fmtEur(s.deckungsbeitrag) + '</td></tr>').join('') +
              '</tbody></table></div>'
            : '');
      } catch (err) {
        out.innerHTML = '<p class="module-desc">Fehler: ' + esc(err.message) + '</p>';
      } finally {
        window.SonaLoader.hide();
      }
    });
  }

  function bindTableSort() {
    const tbl = document.getElementById('ctrlRowsTable');
    if (!tbl) return;
    tbl.querySelectorAll('th.bv-sort').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (CTRL_STATE.sortBy === col) {
          CTRL_STATE.sortDir = CTRL_STATE.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          CTRL_STATE.sortBy = col;
          CTRL_STATE.sortDir = (col === 'artikel' || col === 'warengruppe') ? 'asc' : 'desc';
        }
        renderTabArea();
      });
    });
  }

  function renderTabArea() {
    const slot = document.getElementById('ctrlSubTabContent');
    if (!slot) return;

    document.querySelectorAll('#ctrlSubTabs .bv-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === CTRL_STATE.activeSubTab);
    });

    if (CTRL_STATE.activeSubTab === 'PROGNOSE') {
      renderPrognoseTab(slot);
      return;
    }

    if (CTRL_STATE.activeSubTab === 'SCHWUND_BRUCH') {
      if (window.SonaOperationsModule && typeof window.SonaOperationsModule.renderAuswertungInto === 'function') {
        window.SonaOperationsModule.renderAuswertungInto(slot, {
          standortId: CTRL_STATE.standortId,
          standortName: CTRL_STATE.standortName
        });
      } else {
        slot.innerHTML = '<div class="card"><p class="module-desc">Schwund- &amp; Bruch-Auswertung konnte nicht geladen werden.</p></div>';
      }
      return;
    }

    const d = CTRL_STATE.currentData;
    if (!d) return;
    if (CTRL_STATE.activeSubTab === 'GESAMT') {
      slot.innerHTML = renderGesamtTab(d);
    } else if (CTRL_STATE.activeSubTab === 'WARENGRUPPE') {
      slot.innerHTML = renderRowsTab(d, false);
      bindTableSort();
    } else if (CTRL_STATE.activeSubTab === 'ARTIKEL') {
      slot.innerHTML = renderRowsTab(d, true);
      bindTableSort();
    }
  }

  function renderShell(container) {
    const m = CTRL_STATE.meta || {};
    const perioden = Array.isArray(m.perioden) ? m.perioden : [];
    const hgs = ['ALLE'].concat(Array.isArray(m.hauptgruppen) ? m.hauptgruppen : []);

    container.innerHTML =
      '<div class="card bv-toolbar-card">' +
        '<div class="bv-toolbar">' +
          '<div class="bv-toolbar-group">' +
            '<select id="ctrlPeriodSelect" class="input-control bv-ctrl" aria-label="Periode">' +
              perioden.slice().reverse().map(p => '<option value="' + esc(p.id) + '"' + (p.id === CTRL_STATE.periodeId ? ' selected' : '') + '>' + esc(p.label || p.id) + '</option>').join('') +
            '</select>' +
            '<select id="ctrlCompareSelect" class="input-control bv-ctrl" aria-label="Vergleich">' +
              '<option value="VORPERIODE"' + (CTRL_STATE.vergleichId === 'VORPERIODE' ? ' selected' : '') + '>Vorperiode</option>' +
              '<option value="VORJAHR"' + (CTRL_STATE.vergleichId === 'VORJAHR' ? ' selected' : '') + '>Vorjahresmonat</option>' +
              '<option value="KEIN"' + (CTRL_STATE.vergleichId === 'KEIN' ? ' selected' : '') + '>Kein Vergleich</option>' +
            '</select>' +
            '<select id="ctrlHgSelect" class="input-control bv-ctrl" aria-label="Hauptgruppe">' +
              hgs.map(h => '<option value="' + esc(h) + '"' + (h === CTRL_STATE.hauptgruppe ? ' selected' : '') + '>' + esc(h === 'ALLE' ? 'Alle Hauptgruppen' : h) + '</option>').join('') +
            '</select>' +
            '<input id="ctrlSearchInput" type="search" class="input-control bv-ctrl" placeholder="Warengruppe / Artikel suchen …" value="' + esc(CTRL_STATE.searchQuery) + '">' +
          '</div>' +
          '<div class="bv-toolbar-group">' +
            '<button type="button" class="btn btn-sm" id="ctrlBtnRefresh">Aktualisieren</button>' +
            (CTRL_STATE.legacyUrl ? '<a class="btn btn-sm" href="' + esc(CTRL_STATE.legacyUrl) + '" target="_blank" rel="noopener">Vollansicht ↗</a>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="ctrlKpiSlot">' + (CTRL_STATE.currentData ? renderKpis(CTRL_STATE.currentData) : '') + '</div>' +
      '<div id="ctrlSubTabs" class="bv-subtabs">' +
        '<button type="button" class="bv-tab-btn" data-tab="GESAMT">Gesamt &amp; Renner-Penner</button>' +
        '<button type="button" class="bv-tab-btn" data-tab="WARENGRUPPE">Warengruppen</button>' +
        '<button type="button" class="bv-tab-btn" data-tab="ARTIKEL">Artikel</button>' +
        '<button type="button" class="bv-tab-btn" data-tab="PROGNOSE">Preis-Prognose</button>' +
        '<button type="button" class="bv-tab-btn" data-tab="SCHWUND_BRUCH">Schwund &amp; Bruch</button>' +
      '</div>' +
      '<div id="ctrlSubTabContent"></div>';

    document.getElementById('ctrlPeriodSelect').addEventListener('change', ev => {
      CTRL_STATE.periodeId = ev.target.value;
      loadAnalyse(false);
    });
    document.getElementById('ctrlCompareSelect').addEventListener('change', ev => {
      CTRL_STATE.vergleichId = ev.target.value;
      loadAnalyse(false);
    });
    document.getElementById('ctrlHgSelect').addEventListener('change', ev => {
      CTRL_STATE.hauptgruppe = ev.target.value;
      loadAnalyse(false);
    });
    document.getElementById('ctrlSearchInput').addEventListener('input', ev => {
      CTRL_STATE.searchQuery = ev.target.value;
      if (CTRL_STATE.searchTimer) clearTimeout(CTRL_STATE.searchTimer);
      CTRL_STATE.searchTimer = setTimeout(() => renderTabArea(), 240);
    });
    document.getElementById('ctrlBtnRefresh').addEventListener('click', async () => {
      clearCache(CTRL_STATE.standortId);
      CTRL_STATE.prognoseMeta = null;
      window.SonaLoader.show(800);
      try {
        await window.SonaApi.refreshControlling(CTRL_STATE.standortId);
        notify('Controlling-Cache aktualisiert.');
      } catch (e) {}
      window.SonaLoader.hide();
      await mountInternal(true);
    });
    document.getElementById('ctrlSubTabs').addEventListener('click', ev => {
      const btn = ev.target.closest('button[data-tab]');
      if (!btn) return;
      CTRL_STATE.activeSubTab = btn.dataset.tab;
      if (CTRL_STATE.activeSubTab === 'PROGNOSE' || CTRL_STATE.activeSubTab === 'SCHWUND_BRUCH') {
        renderTabArea();
      } else {
        loadAnalyse(false);
      }
    });

    renderTabArea();
  }

  async function loadAnalyse(forceRefresh) {
    const ebene = CTRL_STATE.activeSubTab === 'PROGNOSE' ? 'GESAMT' : CTRL_STATE.activeSubTab;
    const filter = {
      ebene: ebene,
      periodeId: CTRL_STATE.periodeId,
      vergleichId: CTRL_STATE.vergleichId,
      hauptgruppe: CTRL_STATE.hauptgruppe === 'ALLE' ? '' : CTRL_STATE.hauptgruppe
    };
    const key = [CTRL_STATE.standortId, ebene, filter.periodeId, filter.vergleichId, filter.hauptgruppe].join('::');
    const hit = !forceRefresh && DATA_CACHE[key];
    if (hit && (Date.now() - hit.ts) < CACHE_TTL_MS) {
      CTRL_STATE.currentData = hit.data;
      const kpiSlot = document.getElementById('ctrlKpiSlot');
      if (kpiSlot) kpiSlot.innerHTML = renderKpis(hit.data);
      renderTabArea();
      return;
    }

    window.SonaLoader.show(900);
    try {
      const res = await window.SonaApi.getControllingAnalyse(CTRL_STATE.standortId, filter, forceRefresh);
      if (!res || res.success === false) {
        notify('Controlling-Fehler: ' + ((res && res.error) || 'Unbekannter Fehler'));
        return;
      }
      CTRL_STATE.currentData = res.data;
      DATA_CACHE[key] = { ts: Date.now(), data: res.data };
      const kpiSlot = document.getElementById('ctrlKpiSlot');
      if (kpiSlot) kpiSlot.innerHTML = renderKpis(res.data);
      renderTabArea();
    } catch (err) {
      notify('Verbindungsfehler: ' + err.message);
    } finally {
      window.SonaLoader.hide();
    }
  }

  async function mountInternal(forceRefresh) {
    const container = document.getElementById('osMainContent');
    if (!container) return;

    const cachedMeta = !forceRefresh && META_CACHE[CTRL_STATE.standortId];
    if (cachedMeta && (Date.now() - cachedMeta.ts) < CACHE_TTL_MS) {
      if (cachedMeta.status !== 'AKTIV') {
        container.innerHTML =
          '<div class="card">' +
            '<div class="kicker">Ebene 3 · ' + esc(CTRL_STATE.standortName) + ' (' + esc(CTRL_STATE.standortId) + ')</div>' +
            '<h3>Controlling noch in Vorbereitung</h3>' +
            '<p class="module-desc">' + esc(cachedMeta.message) + '</p>' +
          '</div>';
        return;
      }
      CTRL_STATE.meta = cachedMeta.meta;
      if (!CTRL_STATE.periodeId && CTRL_STATE.meta.letztePeriodeId) {
        CTRL_STATE.periodeId = CTRL_STATE.meta.letztePeriodeId;
      }
      renderShell(container);
      await loadAnalyse(false);
      return;
    }

    container.innerHTML = '<div class="card"><div class="kicker">Ebene 3 · ' + esc(CTRL_STATE.standortName) + '</div><h3>Lade Controlling &amp; Analyse …</h3><p class="module-desc">Periodenvergleich wird autorisiert über das SONA OS JSON-Gateway geladen.</p></div>';
    window.SonaLoader.show(900);
    try {
      const res = await window.SonaApi.getControllingMeta(CTRL_STATE.standortId, forceRefresh);
      if (!res || res.success === false) {
        container.innerHTML = '<div class="card"><div class="kicker">Ebene 3 · Fehler</div><h3>Controlling konnte nicht geladen werden</h3><p class="module-desc">' + esc((res && res.error) || 'Unbekannter Fehler') + '</p></div>';
        return;
      }
      if (res.status && res.status !== 'AKTIV') {
        META_CACHE[CTRL_STATE.standortId] = { ts: Date.now(), status: res.status, message: res.message || '' };
        container.innerHTML =
          '<div class="card">' +
            '<div class="kicker">Ebene 3 · ' + esc(CTRL_STATE.standortName) + ' (' + esc(CTRL_STATE.standortId) + ')</div>' +
            '<h3>Controlling für diesen Standort in Vorbereitung</h3>' +
            '<p class="module-desc">' + esc(res.message || 'Für diesen Standort ist noch keine Controlling-Tabelle verknüpft.') + '</p>' +
          '</div>';
        return;
      }

      CTRL_STATE.meta = res.meta || {};
      META_CACHE[CTRL_STATE.standortId] = { ts: Date.now(), status: 'AKTIV', meta: CTRL_STATE.meta };
      if (!CTRL_STATE.periodeId && CTRL_STATE.meta.letztePeriodeId) {
        CTRL_STATE.periodeId = CTRL_STATE.meta.letztePeriodeId;
      }
      renderShell(container);
      await loadAnalyse(forceRefresh);
    } catch (err) {
      container.innerHTML = '<div class="card"><div class="kicker">Verbindungsfehler</div><h3>Gateway nicht erreichbar</h3><p class="module-desc">' + esc(err.message) + '</p></div>';
    } finally {
      window.SonaLoader.hide();
    }
  }

  window.SonaControllingModule = {
    mount: function(session, mod) {
      const changedLoc = CTRL_STATE.standortId !== session.standortId;
      CTRL_STATE.standortId = session.standortId;
      CTRL_STATE.standortName = session.standortName;
      CTRL_STATE.legacyUrl = (mod && mod.legacyUrl) || '';
      if (changedLoc) {
        CTRL_STATE.periodeId = '';
        CTRL_STATE.hauptgruppe = 'ALLE';
        CTRL_STATE.searchQuery = '';
        CTRL_STATE.currentData = null;
        CTRL_STATE.prognoseMeta = null;
      }
      return mountInternal(false);
    },
    clearCache: clearCache
  };
})();
