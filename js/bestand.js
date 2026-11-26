'use strict';

(function() {
  const CACHE_TTL_MS = 120000;
  const CLIENT_CACHE = {};

  const BV_STATE = {
    standortId: '',
    standortName: '',
    permissions: null,
    legacyUrl: '',
    data: null,
    activeSubTab: 'matrix',
    selectedPeriodId: '',
    selectedMode: 'SINGLE_MONTH',
    selectedCategory: 'Alle',
    searchQuery: '',
    sortBy: 'net_value_in',
    sortDir: 'desc',
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

  function fmtPct(val) {
    if (val === null || val === undefined || isNaN(Number(val))) return '–';
    return Number(val).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
  }

  function fmtDelta(cur, prev) {
    if (cur == null || prev == null || isNaN(Number(cur)) || isNaN(Number(prev)) || Number(prev) === 0) {
      return '<span class="bv-delta">Vergleich: –</span>';
    }
    const diff = Number(cur) - Number(prev);
    const pct = (diff / Math.abs(Number(prev))) * 100;
    const sign = diff > 0 ? '+' : '';
    const cls = diff > 0 ? 'bv-delta-up' : (diff < 0 ? 'bv-delta-down' : '');
    return '<span class="bv-delta ' + cls + '">' + sign + fmtPct(pct) + ' vs. Vorperiode</span>';
  }

  function canWrite() {
    const p = BV_STATE.permissions || {};
    const lvl = String(p.accessLevel || 'READ').toUpperCase();
    return lvl === 'WRITE' || lvl === 'ADMIN' || !!p.adminMatrix;
  }

  function canAdmin() {
    const p = BV_STATE.permissions || {};
    return String(p.accessLevel || '').toUpperCase() === 'ADMIN' || !!p.adminMatrix;
  }

  function getCacheKey(standortId, mode, periodId) {
    return [standortId, mode || 'SINGLE_MONTH', periodId || 'LATEST'].join('::');
  }

  function clearCache(standortId) {
    if (!standortId) {
      Object.keys(CLIENT_CACHE).forEach(k => delete CLIENT_CACHE[k]);
      return;
    }
    const prefix = String(standortId) + '::';
    Object.keys(CLIENT_CACHE).forEach(k => {
      if (k.indexOf(prefix) === 0) delete CLIENT_CACHE[k];
    });
  }

  function statusBadge(status) {
    const s = String(status || '').toUpperCase();
    if (!s || s === 'OK' || s === 'AUSGEGLICHEN' || s === 'GEKLAERT' || s === 'NICHT_ERFORDERLICH') {
      return '<span class="badge badge-ok">' + esc(s || 'OK') + '</span>';
    }
    if (s.indexOf('KRIT') !== -1 || s.indexOf('NEGATIV') !== -1 || s.indexOf('FEHL') !== -1 || s.indexOf('DIFFERENZ') !== -1) {
      return '<span class="badge badge-err">' + esc(s) + '</span>';
    }
    return '<span class="badge badge-warn">' + esc(s) + '</span>';
  }

  function notify(msg) {
    if (window.SonaApp && typeof window.SonaApp.toast === 'function') {
      window.SonaApp.toast(msg);
    }
  }

  function getFilteredItems() {
    const d = BV_STATE.data;
    if (!d || !Array.isArray(d.matrixItems)) return [];
    const q = BV_STATE.searchQuery.trim().toLowerCase();
    const cat = BV_STATE.selectedCategory;

    const list = d.matrixItems.filter(it => {
      if (cat && cat !== 'Alle' && String(it.category || '') !== cat) return false;
      if (q) {
        const hay = [it.master_ingredient_name, it.master_ingredient_id, it.category, it.main_group].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    const key = BV_STATE.sortBy;
    const dir = BV_STATE.sortDir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      const va = a[key];
      const vb = b[key];
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va || '').localeCompare(String(vb || ''), 'de') * dir;
      }
      return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
    });
  }

  function renderKpis(d) {
    const cur = d.currentTotals || {};
    const cmp = d.compareTotals || {};
    const dqCrit = Number(d.dqCriticalCount) || 0;
    const balanceVal = cur.inventory_value_variance !== null && cur.inventory_value_variance !== undefined
      ? cur.inventory_value_variance
      : cur.net_value_balance_before_inventory;
    const balanceLabel = cur.inventory_value_variance !== null && cur.inventory_value_variance !== undefined
      ? 'Inventurabweichung (Netto)'
      : 'Rechn. Saldo vor Inventur';

    return '<div class="bv-kpi-grid">' +
      '<div class="bv-kpi-card">' +
        '<div class="kicker">Warenzugang (Netto)</div>' +
        '<div class="bv-kpi-val tabular">' + fmtEur(cur.net_value_in) + '</div>' +
        fmtDelta(cur.net_value_in, cmp.net_value_in) +
      '</div>' +
      '<div class="bv-kpi-card">' +
        '<div class="kicker">Kassen-Warenverbrauch</div>' +
        '<div class="bv-kpi-val tabular">' + fmtEur(cur.net_value_consumed_sales) + '</div>' +
        fmtDelta(cur.net_value_consumed_sales, cmp.net_value_consumed_sales) +
      '</div>' +
      '<div class="bv-kpi-card">' +
        '<div class="kicker">Dok. Verlust / Schwund</div>' +
        '<div class="bv-kpi-val tabular">' + fmtEur(cur.net_value_documented_loss) + '</div>' +
        fmtDelta(cur.net_value_documented_loss, cmp.net_value_documented_loss) +
      '</div>' +
      '<div class="bv-kpi-card">' +
        '<div class="kicker">' + esc(balanceLabel) + '</div>' +
        '<div class="bv-kpi-val tabular">' + fmtEur(balanceVal) + '</div>' +
        '<span class="bv-delta">Personal/Mkt: ' + fmtEur(cur.net_value_documented_use) + '</span>' +
      '</div>' +
      '<div class="bv-kpi-card">' +
        '<div class="kicker">Masterzutaten &amp; Lieferanten</div>' +
        '<div class="bv-kpi-val tabular">' + esc(d.mastersCount || (d.matrixItems ? d.matrixItems.length : 0)) + ' / ' + esc((d.supplierStats || []).length) + '</div>' +
        '<span class="bv-delta">Rechnungen: ' + esc((d.invoicesList || []).length) + '</span>' +
      '</div>' +
      '<div class="bv-kpi-card">' +
        '<div class="kicker">Datenqualität (Kritisch)</div>' +
        '<div class="bv-kpi-val tabular" style="color:' + (dqCrit > 0 ? '#F2B8B5' : '#A9DFBF') + ';">' + esc(dqCrit) + '</div>' +
        '<span class="bv-delta">Gesamt-Hinweise: ' + esc((d.dqIssues || []).length) + '</span>' +
      '</div>' +
    '</div>';
  }

  function renderMatrixTab() {
    const items = getFilteredItems();
    const sortArrow = col => BV_STATE.sortBy === col ? (BV_STATE.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    const rows = items.length
      ? items.map(it =>
          '<tr class="clickable-row" data-mid="' + esc(it.master_ingredient_id) + '">' +
            '<td><b>' + esc(it.master_ingredient_name) + '</b><div style="font-size:10.5px;color:var(--os-silk);">' + esc(it.master_ingredient_id) + ' · ' + esc(it.category || '–') + '</div></td>' +
            '<td class="tabular">' + fmtNum(it.quantity_in, 2) + ' ' + esc(it.reference_unit || '') + '</td>' +
            '<td class="tabular">' + fmtEur(it.net_value_in) + '</td>' +
            '<td class="tabular">' + fmtEur(it.net_value_consumed_sales) + '</td>' +
            '<td class="tabular">' + fmtEur(it.net_value_documented_loss) + '</td>' +
            '<td class="tabular">' + fmtEur(it.inventory_value_variance !== null ? it.inventory_value_variance : it.net_value_balance_before_inventory) + '</td>' +
            '<td>' + statusBadge(it.variance_status) + '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="7">Keine Masterzutaten für den gewählten Filter gefunden.</td></tr>';

    return '<div class="card">' +
      '<div class="card-head">' +
        '<div><div class="kicker">Warenfluss je Masterzutat</div><h3>Matrix (' + esc(items.length) + ' Positionen)</h3></div>' +
        '<span class="kicker">Klick auf Zeile für Detailanalyse</span>' +
      '</div>' +
      '<div class="table-wrap"><table id="bvMatrixTable"><thead><tr>' +
        '<th class="bv-sort" data-col="master_ingredient_name">Masterzutat' + sortArrow('master_ingredient_name') + '</th>' +
        '<th class="bv-sort" data-col="quantity_in">Zugang Menge' + sortArrow('quantity_in') + '</th>' +
        '<th class="bv-sort" data-col="net_value_in">Zugang Netto' + sortArrow('net_value_in') + '</th>' +
        '<th class="bv-sort" data-col="net_value_consumed_sales">Kassenverbrauch' + sortArrow('net_value_consumed_sales') + '</th>' +
        '<th class="bv-sort" data-col="net_value_documented_loss">Schwund' + sortArrow('net_value_documented_loss') + '</th>' +
        '<th class="bv-sort" data-col="net_value_balance_before_inventory">Saldo / Abw.' + sortArrow('net_value_balance_before_inventory') + '</th>' +
        '<th>Status</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '</div>';
  }

  function renderCategoriesTab(d) {
    const cats = Array.isArray(d.categoryStats) ? d.categoryStats : [];
    const abcIn = (d.abc && d.abc.inbound) || {};
    const abcCons = (d.abc && d.abc.consumption) || {};
    const abcLoss = (d.abc && d.abc.loss) || {};

    const abcCard = (title, obj) =>
      '<div class="bv-kpi-card">' +
        '<div class="kicker">' + esc(title) + '</div>' +
        '<div style="margin-top:8px;font-size:12.5px;display:flex;flex-direction:column;gap:4px;">' +
          '<div><b>A:</b> ' + esc((obj.A && obj.A.count) || 0) + ' Artikel · ' + fmtEur(obj.A && obj.A.value) + ' (' + fmtPct(obj.A && obj.A.sharePct) + ')</div>' +
          '<div><b>B:</b> ' + esc((obj.B && obj.B.count) || 0) + ' Artikel · ' + fmtEur(obj.B && obj.B.value) + ' (' + fmtPct(obj.B && obj.B.sharePct) + ')</div>' +
          '<div><b>C:</b> ' + esc((obj.C && obj.C.count) || 0) + ' Artikel · ' + fmtEur(obj.C && obj.C.value) + ' (' + fmtPct(obj.C && obj.C.sharePct) + ')</div>' +
        '</div>' +
      '</div>';

    const rows = cats.length
      ? cats.map(c =>
          '<tr>' +
            '<td><b>' + esc(c.category || c.name || '–') + '</b></td>' +
            '<td class="tabular">' + esc(c.itemCount || c.count || 0) + '</td>' +
            '<td class="tabular">' + fmtEur(c.net_value_in !== undefined ? c.net_value_in : c.valueIn) + '</td>' +
            '<td class="tabular">' + fmtEur(c.net_value_consumed_sales !== undefined ? c.net_value_consumed_sales : c.valueConsumed) + '</td>' +
            '<td class="tabular">' + fmtEur(c.net_value_documented_loss !== undefined ? c.net_value_documented_loss : c.valueLoss) + '</td>' +
            '<td class="tabular">' + fmtPct(c.shareInPct !== undefined ? c.shareInPct : c.sharePct) + '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="6">Keine Warengruppen-Auswertung vorhanden.</td></tr>';

    return '<div class="grid-3" style="margin-bottom:16px;">' +
      abcCard('ABC-Analyse · Warenzugang', abcIn) +
      abcCard('ABC-Analyse · Kassenverbrauch', abcCons) +
      abcCard('ABC-Analyse · Schwund/Verlust', abcLoss) +
    '</div>' +
    '<div class="card">' +
      '<div class="card-head"><div><div class="kicker">Struktur</div><h3>Warengruppen-Übersicht</h3></div></div>' +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>Warengruppe</th><th>Zutaten</th><th>Zugang Netto</th><th>Kassenverbrauch</th><th>Schwund</th><th>Anteil</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '</div>';
  }

  function renderSuppliersTab(d) {
    const sup = Array.isArray(d.supplierStats) ? d.supplierStats : [];
    const rows = sup.length
      ? sup.map(s =>
          '<tr>' +
            '<td><b>' + esc(s.supplier_name || s.name || '–') + '</b></td>' +
            '<td class="tabular">' + esc(s.invoiceCount || s.deliveries || 0) + '</td>' +
            '<td class="tabular">' + esc(s.itemCount || s.uniqueMasters || 0) + '</td>' +
            '<td class="tabular">' + fmtEur(s.net_value_in !== undefined ? s.net_value_in : s.totalValue) + '</td>' +
            '<td class="tabular">' + fmtPct(s.sharePct) + '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="5">Keine Lieferantendaten in der gewählten Periode.</td></tr>';

    return '<div class="card">' +
      '<div class="card-head"><div><div class="kicker">Beschaffung</div><h3>Lieferanten-Ranking (' + esc(sup.length) + ')</h3></div></div>' +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>Lieferant</th><th>Rechnungen / Lief.</th><th>Masterzutaten</th><th>Netto-Volumen</th><th>Anteil</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '</div>';
  }

  function renderVarianceTab(d) {
    const items = getFilteredItems().filter(it =>
      it.variance_status !== 'AUSGEGLICHEN' ||
      Math.abs(Number(it.inventory_value_variance || it.net_value_balance_before_inventory || 0)) >= 1
    ).slice(0, 60);

    const hints = Array.isArray(d.actionHints) ? d.actionHints : [];
    const hintsHtml = hints.length
      ? '<div class="card"><div class="card-head"><div><div class="kicker">Handlungsfelder</div><h3>Prüfhinweise (' + esc(hints.length) + ')</h3></div></div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;">' +
        hints.slice(0, 8).map(h =>
          '<div style="padding:10px 12px;border:1px solid var(--os-border);border-radius:4px;background:var(--os-bg-soft);">' +
            '<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:4px;">' +
              '<b>' + esc(h.title || h.category || 'Hinweis') + '</b>' +
              statusBadge(h.priority || h.severity || 'PRUEFEN') +
            '</div>' +
            '<div class="module-desc">' + esc(h.message || h.description || h.reason || '') + '</div>' +
          '</div>'
        ).join('') +
        '</div></div>'
      : '';

    const rows = items.length
      ? items.map(it =>
          '<tr>' +
            '<td><b>' + esc(it.master_ingredient_name) + '</b><div style="font-size:10.5px;color:var(--os-silk);">' + esc(it.master_ingredient_id) + '</div></td>' +
            '<td class="tabular">' + fmtEur(it.net_value_in) + '</td>' +
            '<td class="tabular">' + fmtEur(it.inventory_value_variance !== null ? it.inventory_value_variance : it.net_value_balance_before_inventory) + '</td>' +
            '<td>' + statusBadge(it.variance_status) + '</td>' +
            '<td>' + statusBadge(it.clarification_status) + '</td>' +
            '<td>' +
              (canWrite()
                ? '<button type="button" class="btn btn-sm bv-clarify-btn" data-mid="' + esc(it.master_ingredient_id) + '" data-name="' + esc(it.master_ingredient_name) + '">Klären</button>'
                : '<span class="kicker">Nur Lesen</span>') +
            '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="6">Keine offenen Abweichungen im aktuellen Filter.</td></tr>';

    return hintsHtml +
      '<div class="card">' +
        '<div class="card-head"><div><div class="kicker">Abweichungsprüfung</div><h3>Positionen zur Klärung</h3></div></div>' +
        '<div class="table-wrap"><table><thead><tr>' +
          '<th>Masterzutat</th><th>Zugang</th><th>Abweichung / Saldo</th><th>Status</th><th>Klärung</th><th>Aktion</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '</div>';
  }

  function renderDqAndSyncTab(d) {
    const dq = Array.isArray(d.dqIssues) ? d.dqIssues : [];
    const logs = Array.isArray(d.syncLogs) ? d.syncLogs : [];

    const dqRows = dq.length
      ? dq.slice(0, 80).map(i =>
          '<tr>' +
            '<td>' + statusBadge(i.priority) + '</td>' +
            '<td><b>' + esc(i.item_label || i.master_ingredient_id || '–') + '</b><div style="font-size:10.5px;color:var(--os-silk);">' + esc(i.error_category || '') + '</div></td>' +
            '<td>' + esc(i.description || '') + '</td>' +
            '<td class="tabular">' + fmtEur(i.affected_value) + '</td>' +
            '<td>' + esc(i.suggested_action || '–') + '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="5">Keine Datenqualitäts-Hinweise in dieser Periode.</td></tr>';

    const logRows = logs.length
      ? logs.slice(0, 15).map(l =>
          '<tr>' +
            '<td class="tabular">' + esc(l.finished_at || '–') + '</td>' +
            '<td>' + esc(l.source_system || '–') + '</td>' +
            '<td>' + statusBadge(l.status) + '</td>' +
            '<td class="tabular">' + esc(l.records_fb_valid) + '</td>' +
            '<td class="tabular">' + esc(l.records_excluded_non_fb) + '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="5">Noch keine Sync-Protokolle vorhanden.</td></tr>';

    return '<div class="card">' +
      '<div class="card-head"><div><div class="kicker">Datenqualität</div><h3>Prüffälle (' + esc(dq.length) + ')</h3></div></div>' +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>Priorität</th><th>Element</th><th>Beschreibung</th><th>Wert</th><th>Empfehlung</th>' +
      '</tr></thead><tbody>' + dqRows + '</tbody></table></div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-head"><div><div class="kicker">Synchronisation</div><h3>Letzte Sync-Läufe</h3></div></div>' +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>Beendet am</th><th>Quelle</th><th>Status</th><th>F&amp;B gültig</th><th>Non-F&amp;B aussortiert</th>' +
      '</tr></thead><tbody>' + logRows + '</tbody></table></div>' +
    '</div>';
  }

  function renderSubTabContent() {
    const slot = document.getElementById('bvSubTabContent');
    if (!slot || !BV_STATE.data) return;

    document.querySelectorAll('#bvSubTabs .bv-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === BV_STATE.activeSubTab);
    });

    const d = BV_STATE.data;
    if (BV_STATE.activeSubTab === 'matrix') {
      slot.innerHTML = renderMatrixTab();
      bindMatrixInteractions();
    } else if (BV_STATE.activeSubTab === 'categories') {
      slot.innerHTML = renderCategoriesTab(d);
    } else if (BV_STATE.activeSubTab === 'suppliers') {
      slot.innerHTML = renderSuppliersTab(d);
    } else if (BV_STATE.activeSubTab === 'variance') {
      slot.innerHTML = renderVarianceTab(d);
      bindClarifyButtons();
    } else if (BV_STATE.activeSubTab === 'dq') {
      slot.innerHTML = renderDqAndSyncTab(d);
    }
  }

  function bindMatrixInteractions() {
    const table = document.getElementById('bvMatrixTable');
    if (!table) return;
    table.querySelectorAll('th.bv-sort').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (BV_STATE.sortBy === col) {
          BV_STATE.sortDir = BV_STATE.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          BV_STATE.sortBy = col;
          BV_STATE.sortDir = col === 'master_ingredient_name' ? 'asc' : 'desc';
        }
        renderSubTabContent();
      });
    });
    table.querySelectorAll('tbody tr.clickable-row').forEach(tr => {
      tr.addEventListener('click', () => {
        const mid = tr.dataset.mid;
        if (mid) openMasterDetailModal(mid);
      });
    });
  }

  function bindClarifyButtons() {
    document.querySelectorAll('.bv-clarify-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openClarifyModal(btn.dataset.mid, btn.dataset.name);
      });
    });
  }

  function closeBvModal() {
    const existing = document.getElementById('bvDynamicModal');
    if (existing) existing.remove();
  }

  async function openMasterDetailModal(masterId) {
    closeBvModal();
    const d = BV_STATE.data || {};
    const periodIds = (d.selection && d.selection.currentPeriodIds) || [];

    const modal = document.createElement('div');
    modal.id = 'bvDynamicModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML =
      '<div class="modal-card bv-modal-wide">' +
        '<div class="card-head">' +
          '<div><div class="kicker">Masterzutat-Detail · ' + esc(BV_STATE.standortName) + '</div><h3 id="bvDetailTitle">' + esc(masterId) + '</h3></div>' +
          '<button type="button" class="btn btn-sm" id="bvModalCloseBtn">Schließen</button>' +
        '</div>' +
        '<div id="bvDetailBody"><p class="module-desc">Lade Detaildaten …</p></div>' +
      '</div>';
    document.body.appendChild(modal);
    document.getElementById('bvModalCloseBtn').addEventListener('click', closeBvModal);
    modal.addEventListener('click', ev => { if (ev.target === modal) closeBvModal(); });

    try {
      const res = await window.SonaApi.getBestandMasterDetail(BV_STATE.standortId, masterId, periodIds);
      const body = document.getElementById('bvDetailBody');
      if (!body) return;
      if (!res || res.success === false) {
        body.innerHTML = '<p class="module-desc">' + esc((res && res.error) || 'Detaildaten konnten nicht geladen werden.') + '</p>';
        return;
      }

      const title = document.getElementById('bvDetailTitle');
      if (title && res.master && res.master.name) {
        title.textContent = res.master.name + ' (' + masterId + ')';
      }

      const sups = Array.isArray(res.supplierComparison) ? res.supplierComparison : [];
      const inb = Array.isArray(res.inboundMovements) ? res.inboundMovements : [];
      const docOut = Array.isArray(res.documentedOutMovements) ? res.documentedOutMovements : [];
      const recipes = Array.isArray(res.affectedRecipes) ? res.affectedRecipes : [];

      body.innerHTML =
        '<div class="grid-3" style="margin-bottom:14px;">' +
          '<div class="bv-kpi-card"><div class="kicker">Lieferanten</div><div class="bv-kpi-val tabular">' + esc(sups.length) + '</div></div>' +
          '<div class="bv-kpi-card"><div class="kicker">Zugänge (Periode)</div><div class="bv-kpi-val tabular">' + esc(inb.length) + '</div></div>' +
          '<div class="bv-kpi-card"><div class="kicker">Betroffene Rezepte</div><div class="bv-kpi-val tabular">' + esc(recipes.length) + '</div></div>' +
        '</div>' +
        (sups.length
          ? '<div class="kicker" style="margin:10px 0 6px;">Lieferantenvergleich</div>' +
            '<div class="table-wrap" style="margin-bottom:14px;"><table><thead><tr><th>Lieferant</th><th>Menge</th><th>Wert</th><th>Ø Preis</th><th>Lieferungen</th></tr></thead><tbody>' +
            sups.map(s => '<tr><td>' + esc(s.supplier_name) + '</td><td class="tabular">' + fmtNum(s.qty, 2) + '</td><td class="tabular">' + fmtEur(s.val) + '</td><td class="tabular">' + fmtEur(s.avgPrice) + '</td><td class="tabular">' + esc(s.deliveries) + '</td></tr>').join('') +
            '</tbody></table></div>'
          : '') +
        (inb.length
          ? '<div class="kicker" style="margin:10px 0 6px;">Wareneingänge (max. 20)</div>' +
            '<div class="table-wrap" style="margin-bottom:14px;"><table><thead><tr><th>Datum</th><th>Lieferant</th><th>Artikel</th><th>Menge</th><th>Netto</th></tr></thead><tbody>' +
            inb.slice(0, 20).map(m => '<tr><td class="tabular">' + esc(m.movement_date) + '</td><td>' + esc(m.supplier_name) + '</td><td>' + esc(m.purchase_item_name) + '</td><td class="tabular">' + fmtNum(m.quantity_reference, 2) + ' ' + esc(m.reference_unit || '') + '</td><td class="tabular">' + fmtEur(m.net_value) + '</td></tr>').join('') +
            '</tbody></table></div>'
          : '') +
        (docOut.length
          ? '<div class="kicker" style="margin:10px 0 6px;">Dokumentierte Abgänge / Schwund</div>' +
            '<div class="table-wrap"><table><thead><tr><th>Datum</th><th>Vorgang</th><th>Menge</th><th>Wert</th><th>Kommentar</th></tr></thead><tbody>' +
            docOut.slice(0, 15).map(o => '<tr><td class="tabular">' + esc(o.movement_date) + '</td><td>' + esc(o.movement_reason) + '</td><td class="tabular">' + fmtNum(o.quantity_reference, 2) + ' ' + esc(o.reference_unit || '') + '</td><td class="tabular">' + fmtEur(o.net_value) + '</td><td>' + esc(o.comment || '–') + '</td></tr>').join('') +
            '</tbody></table></div>'
          : '');
    } catch (err) {
      const body = document.getElementById('bvDetailBody');
      if (body) body.innerHTML = '<p class="module-desc">Fehler: ' + esc(err.message) + '</p>';
    }
  }

  function openClarifyModal(masterId, masterName) {
    closeBvModal();
    const d = BV_STATE.data || {};
    const activePeriod = (d.selection && d.selection.currentPeriodIds && d.selection.currentPeriodIds[0]) || BV_STATE.selectedPeriodId || '';

    const modal = document.createElement('div');
    modal.id = 'bvDynamicModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML =
      '<div class="modal-card">' +
        '<div class="card-head">' +
          '<div><div class="kicker">Abweichungsklärung · ' + esc(activePeriod) + '</div><h3>' + esc(masterName || masterId) + '</h3></div>' +
          '<button type="button" class="btn btn-sm" id="bvModalCloseBtn">Abbrechen</button>' +
        '</div>' +
        '<div class="form-field">' +
          '<label class="kicker" for="bvClarStatus">Klärungsstatus</label>' +
          '<select id="bvClarStatus" class="input-control">' +
            '<option value="IN_PRUEFUNG">IN_PRUEFUNG</option>' +
            '<option value="GEKLAERT">GEKLAERT</option>' +
            '<option value="ESKALIERT">ESKALIERT</option>' +
          '</select>' +
        '</div>' +
        '<div class="form-field">' +
          '<label class="kicker" for="bvClarReason">Begründung / Ursache</label>' +
          '<input id="bvClarReason" type="text" class="input-control" placeholder="z. B. Nachlieferung, Rezeptkorrektur, Bruch">' +
        '</div>' +
        '<div class="form-field">' +
          '<label class="kicker" for="bvClarAction">Maßnahme (optional)</label>' +
          '<input id="bvClarAction" type="text" class="input-control" placeholder="z. B. Nachzählung veranlasst">' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;">' +
          '<button type="button" class="btn btn-primary btn-sm" id="bvClarSaveBtn">Klärung speichern</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    document.getElementById('bvModalCloseBtn').addEventListener('click', closeBvModal);
    modal.addEventListener('click', ev => { if (ev.target === modal) closeBvModal(); });

    document.getElementById('bvClarSaveBtn').addEventListener('click', async () => {
      const btn = document.getElementById('bvClarSaveBtn');
      btn.disabled = true;
      btn.textContent = 'Speichert…';
      try {
        const res = await window.SonaApi.saveBestandClarification(BV_STATE.standortId, {
          periodId: activePeriod,
          masterIngredientId: masterId,
          explanationStatus: document.getElementById('bvClarStatus').value,
          explanation: document.getElementById('bvClarReason').value.trim(),
          actionRequired: document.getElementById('bvClarAction').value.trim()
        });
        if (!res || res.success === false) {
          notify('Klärung fehlgeschlagen: ' + ((res && res.error) || 'Unbekannter Fehler'));
          btn.disabled = false;
          btn.textContent = 'Klärung speichern';
          return;
        }
        closeBvModal();
        clearCache(BV_STATE.standortId);
        notify('Abweichungsklärung gespeichert.');
        await loadDashboard(true);
      } catch (err) {
        notify('Fehler: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Klärung speichern';
      }
    });
  }

  function renderFullView(container) {
    const d = BV_STATE.data;
    if (!d) return;

    const periods = Array.isArray(d.periods) ? d.periods : [];
    const activePid = (d.selection && d.selection.currentPeriodIds && d.selection.currentPeriodIds[0]) || BV_STATE.selectedPeriodId || '';
    const categories = ['Alle'].concat(
      Array.from(new Set((d.matrixItems || []).map(it => it.category).filter(Boolean))).sort()
    );

    container.innerHTML =
      '<div class="card bv-toolbar-card">' +
        '<div class="bv-toolbar">' +
          '<div class="bv-toolbar-group">' +
            '<select id="bvPeriodSelect" class="input-control bv-ctrl" aria-label="Periode">' +
              (periods.length
                ? periods.map(p => '<option value="' + esc(p.period_id) + '"' + (p.period_id === activePid ? ' selected' : '') + '>' + esc(p.label || p.period_id) + '</option>').join('')
                : '<option value="">Aktuelle Periode</option>') +
            '</select>' +
            '<select id="bvCategorySelect" class="input-control bv-ctrl" aria-label="Warengruppe">' +
              categories.map(c => '<option value="' + esc(c) + '"' + (c === BV_STATE.selectedCategory ? ' selected' : '') + '>' + esc(c) + '</option>').join('') +
            '</select>' +
            '<input id="bvSearchInput" type="search" class="input-control bv-ctrl" placeholder="Masterzutat suchen …" value="' + esc(BV_STATE.searchQuery) + '">' +
          '</div>' +
          '<div class="bv-toolbar-group">' +
            '<button type="button" class="btn btn-sm" id="bvBtnRefresh">Aktualisieren</button>' +
            (canWrite() ? '<button type="button" class="btn btn-primary btn-sm" id="bvBtnSync">Sync starten</button>' : '') +
            '<select id="bvExportSelect" class="input-control bv-ctrl" aria-label="CSV Export" style="max-width:150px;">' +
              '<option value="">CSV Export …</option>' +
              '<option value="MATRIX">CSV: Matrix</option>' +
              '<option value="ZUGANG">CSV: Zugänge</option>' +
              '<option value="KASSE">CSV: Kasse</option>' +
              '<option value="ABGANG">CSV: Abgänge</option>' +
              '<option value="LIEFERANTEN">CSV: Lieferanten</option>' +
              '<option value="DQ">CSV: Datenqualität</option>' +
            '</select>' +
            (BV_STATE.legacyUrl ? '<a class="btn btn-sm" href="' + esc(BV_STATE.legacyUrl) + '" target="_blank" rel="noopener">Vollansicht ↗</a>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
      renderKpis(d) +
      '<div id="bvSubTabs" class="bv-subtabs">' +
        '<button type="button" class="bv-tab-btn" data-tab="matrix">Warenfluss-Matrix</button>' +
        '<button type="button" class="bv-tab-btn" data-tab="categories">Warengruppen &amp; ABC</button>' +
        '<button type="button" class="bv-tab-btn" data-tab="suppliers">Lieferanten</button>' +
        '<button type="button" class="bv-tab-btn" data-tab="variance">Abweichungen &amp; Klärung</button>' +
        '<button type="button" class="bv-tab-btn" data-tab="dq">Datenqualität &amp; Sync</button>' +
      '</div>' +
      '<div id="bvSubTabContent"></div>';

    document.getElementById('bvPeriodSelect').addEventListener('change', ev => {
      BV_STATE.selectedPeriodId = ev.target.value;
      loadDashboard(false);
    });
    document.getElementById('bvCategorySelect').addEventListener('change', ev => {
      BV_STATE.selectedCategory = ev.target.value;
      renderSubTabContent();
    });
    document.getElementById('bvSearchInput').addEventListener('input', ev => {
      BV_STATE.searchQuery = ev.target.value;
      if (BV_STATE.searchTimer) clearTimeout(BV_STATE.searchTimer);
      BV_STATE.searchTimer = setTimeout(() => renderSubTabContent(), 260);
    });
    document.getElementById('bvBtnRefresh').addEventListener('click', () => {
      clearCache(BV_STATE.standortId);
      loadDashboard(true);
    });

    const syncBtn = document.getElementById('bvBtnSync');
    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Synchronisiert…';
        window.SonaLoader.show(900);
        try {
          const res = await window.SonaApi.runBestandSync(BV_STATE.standortId, 'INKREMENTELL');
          if (!res || res.success === false) {
            notify('Sync fehlgeschlagen: ' + ((res && res.error) || 'Unbekannter Fehler'));
          } else {
            clearCache(BV_STATE.standortId);
            notify('Synchronisation abgeschlossen (' + (res.syncId || 'OK') + ').');
            await loadDashboard(true);
          }
        } catch (err) {
          notify('Sync-Fehler: ' + err.message);
        } finally {
          window.SonaLoader.hide();
          syncBtn.disabled = false;
          syncBtn.textContent = 'Sync starten';
        }
      });
    }

    document.getElementById('bvExportSelect').addEventListener('change', async ev => {
      const exportType = ev.target.value;
      ev.target.value = '';
      if (!exportType) return;
      window.SonaLoader.show(800);
      try {
        const res = await window.SonaApi.exportBestandCsv(BV_STATE.standortId, exportType, {
          mode: BV_STATE.selectedMode,
          periodId: BV_STATE.selectedPeriodId
        });
        if (!res || !res.content) {
          notify('CSV-Export fehlgeschlagen: ' + ((res && res.error) || 'Keine Daten'));
          return;
        }
        const blob = new Blob([res.content], { type: res.mimeType || 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.filename || ('SONA_' + exportType + '_' + BV_STATE.standortId + '.csv');
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        notify('CSV exportiert: ' + a.download);
      } catch (err) {
        notify('Export-Fehler: ' + err.message);
      } finally {
        window.SonaLoader.hide();
      }
    });

    document.getElementById('bvSubTabs').addEventListener('click', ev => {
      const btn = ev.target.closest('button[data-tab]');
      if (!btn) return;
      BV_STATE.activeSubTab = btn.dataset.tab;
      renderSubTabContent();
    });

    renderSubTabContent();
  }

  async function loadDashboard(forceRefresh) {
    const container = document.getElementById('osMainContent');
    if (!container) return;

    const cacheKey = getCacheKey(BV_STATE.standortId, BV_STATE.selectedMode, BV_STATE.selectedPeriodId);
    const cached = !forceRefresh && CLIENT_CACHE[cacheKey];
    if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
      BV_STATE.data = cached.data;
      renderFullView(container);
      return;
    }

    if (!BV_STATE.data || BV_STATE.data.standortId !== BV_STATE.standortId) {
      container.innerHTML = '<div class="card"><div class="kicker">Ebene 7 · ' + esc(BV_STATE.standortName) + '</div><h3>Lade Bestand &amp; Warenverbrauch …</h3><p class="module-desc">Daten werden autorisiert über das SONA OS JSON-Gateway geladen.</p></div>';
    }

    window.SonaLoader.show(900);
    try {
      const res = await window.SonaApi.getBestandDashboard(
        BV_STATE.standortId,
        { mode: BV_STATE.selectedMode, periodId: BV_STATE.selectedPeriodId },
        forceRefresh
      );
      if (!res || res.success === false) {
        container.innerHTML =
          '<div class="card">' +
            '<div class="kicker">Ebene 7 · Fehler</div>' +
            '<h3>Bestand &amp; Warenverbrauch konnte nicht geladen werden</h3>' +
            '<p class="module-desc" style="margin-bottom:14px;">' + esc((res && res.error) || 'Unbekannter Gateway-Fehler.') + '</p>' +
            '<button type="button" class="btn btn-primary btn-sm" id="bvRetryBtn">Erneut versuchen</button>' +
          '</div>';
        const retry = document.getElementById('bvRetryBtn');
        if (retry) retry.addEventListener('click', () => loadDashboard(true));
        return;
      }

      BV_STATE.data = res;
      if (res.selection && res.selection.currentPeriodIds && res.selection.currentPeriodIds[0]) {
        BV_STATE.selectedPeriodId = res.selection.currentPeriodIds[0];
      }
      CLIENT_CACHE[cacheKey] = { ts: Date.now(), data: res };
      renderFullView(container);
    } catch (err) {
      container.innerHTML =
        '<div class="card">' +
          '<div class="kicker">Verbindungsfehler</div>' +
          '<h3>Gateway nicht erreichbar</h3>' +
          '<p class="module-desc" style="margin-bottom:14px;">' + esc(err.message) + '</p>' +
          '<button type="button" class="btn btn-primary btn-sm" id="bvRetryBtn">Erneut versuchen</button>' +
        '</div>';
      const retry = document.getElementById('bvRetryBtn');
      if (retry) retry.addEventListener('click', () => loadDashboard(true));
    } finally {
      window.SonaLoader.hide();
    }
  }

  window.SonaBestandModule = {
    mount: function(session, mod) {
      const changedLoc = BV_STATE.standortId !== session.standortId;
      BV_STATE.standortId = session.standortId;
      BV_STATE.standortName = session.standortName;
      BV_STATE.permissions = session.permissions;
      BV_STATE.legacyUrl = (mod && mod.legacyUrl) || '';
      if (changedLoc) {
        BV_STATE.selectedPeriodId = '';
        BV_STATE.selectedCategory = 'Alle';
        BV_STATE.searchQuery = '';
      }
      return loadDashboard(false);
    },
    clearCache: clearCache
  };
})();
