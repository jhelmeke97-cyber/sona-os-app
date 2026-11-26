'use strict';

(function() {
  const CACHE_TTL_MS = 120000;
  const EK_CACHE = {};

  const EK_STATE = {
    standortId: '',
    standortName: '',
    permissions: null,
    legacyUrl: '',
    data: null,
    activeSubTab: 'articles',
    selectedSupplier: 'Alle',
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

  function fmtPct(val) {
    if (val === null || val === undefined || isNaN(Number(val))) return '–';
    const num = Number(val);
    return (num > 0 ? '+' : '') + num.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
  }

  function canWrite() {
    const p = EK_STATE.permissions || {};
    const lvl = String(p.accessLevel || 'READ').toUpperCase();
    return lvl === 'WRITE' || lvl === 'ADMIN' || !!p.adminMatrix;
  }

  function clearCache(standortId) {
    if (!standortId) {
      Object.keys(EK_CACHE).forEach(k => delete EK_CACHE[k]);
      return;
    }
    delete EK_CACHE[standortId];
  }

  function notify(msg) {
    if (window.SonaApp && typeof window.SonaApp.toast === 'function') {
      window.SonaApp.toast(msg);
    }
  }

  function statusBadge(st) {
    const s = String(st || '').trim().toUpperCase();
    if (s === 'GEPRUEFT' || s === 'AKTIV' || s === 'OK') {
      return '<span class="badge badge-ok">' + esc(s) + '</span>';
    }
    if (s === 'OFFEN' || s === 'PRUEFUNG_NOTWENDIG' || s === 'NEU') {
      return '<span class="badge badge-warn">' + esc(s) + '</span>';
    }
    return '<span class="badge">' + esc(s || '–') + '</span>';
  }

  function renderKpis(d) {
    const c = (d && d.counts) || {};
    const rulesCount = (d && Array.isArray(d.articles)) ? d.articles.filter(a => a.hasSavedRule).length : 0;
    return '<div class="bv-kpi-grid">' +
      '<div class="bv-kpi-card"><div class="kicker">Artikelstamm</div><div class="bv-kpi-val tabular">' + esc(c.totalArticles || 0) + '</div><span class="bv-delta">Gebinderegeln: ' + esc(rulesCount) + '</span></div>' +
      '<div class="bv-kpi-card"><div class="kicker">Lieferanten</div><div class="bv-kpi-val tabular">' + esc(c.suppliersCount || 0) + '</div><span class="bv-delta">Standort ' + esc(EK_STATE.standortId) + '</span></div>' +
      '<div class="bv-kpi-card"><div class="kicker">Masterzutaten</div><div class="bv-kpi-val tabular">' + esc(c.mastersCount || 0) + '</div><span class="bv-delta">Rezeptur-Referenz</span></div>' +
      '<div class="bv-kpi-card"><div class="kicker">Preisradar (Offen)</div><div class="bv-kpi-val tabular" style="color:' + ((c.openPriceIssuesCount || 0) > 0 ? '#F5D58C' : '#A9DFBF') + ';">' + esc(c.openPriceIssuesCount || 0) + '</div><span class="bv-delta">Gesamt-Hinweise: ' + esc(c.totalPriceIssuesCount || 0) + '</span></div>' +
      '<div class="bv-kpi-card"><div class="kicker">Neue Scan-Artikel</div><div class="bv-kpi-val tabular" style="color:' + ((c.openNewCount || 0) > 0 ? '#F5D58C' : '#A9DFBF') + ';">' + esc(c.openNewCount || 0) + '</div><span class="bv-delta">Aus Beleg-Import</span></div>' +
      '<div class="bv-kpi-card"><div class="kicker">Zugriffsstufe</div><div class="bv-kpi-val tabular">' + esc((EK_STATE.permissions && EK_STATE.permissions.accessLevel) || 'READ') + '</div><span class="bv-delta">' + (canWrite() ? 'Freigaben aktiviert' : 'Nur Lesezugriff') + '</span></div>' +
    '</div>';
  }

  function renderArticlesTab(d) {
    const q = EK_STATE.searchQuery.trim().toLowerCase();
    const sup = EK_STATE.selectedSupplier;
    const filtered = (d.articles || []).filter(a => {
      if (sup !== 'Alle' && a.supplier !== sup) return false;
      if (q) {
        const hay = [a.id, a.name, a.supplier, a.artNr, a.masterRef, a.wg].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    const key = EK_STATE.sortBy;
    const dir = EK_STATE.sortDir === 'asc' ? 1 : -1;
    const sorted = filtered.slice().sort((a, b) => {
      const va = a[key];
      const vb = b[key];
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va || '').localeCompare(String(vb || ''), 'de') * dir;
      }
      return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
    });

    const arrow = col => EK_STATE.sortBy === col ? (EK_STATE.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
    const rows = sorted.length
      ? sorted.slice(0, 200).map(a =>
          '<tr>' +
            '<td><b>' + esc(a.name || a.id) + '</b><div style="font-size:10.5px;color:var(--os-silk);">' + esc(a.id) + (a.artNr ? ' · Nr. ' + esc(a.artNr) : '') + '</div></td>' +
            '<td>' + esc(a.supplier) + '</td>' +
            '<td>' + esc(a.masterRef || '–') + '</td>' +
            '<td class="tabular">' + esc(a.gebinde || '–') + ' (' + esc(a.inhalt) + ' ' + esc(a.unit) + ')</td>' +
            '<td class="tabular">' + fmtEur(a.price) + '</td>' +
            '<td class="tabular">' + fmtEur(a.refPrice) + '</td>' +
            '<td>' + statusBadge(a.status) + '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="7">Keine Artikel für den gewählten Filter.</td></tr>';

    return '<div class="card">' +
      '<div class="card-head"><div><div class="kicker">Artikelstamm</div><h3>Einkaufsartikel (' + esc(sorted.length) + ')</h3></div><span class="kicker">Max. 200 Zeilen angezeigt</span></div>' +
      '<div class="table-wrap"><table id="ekArticlesTable"><thead><tr>' +
        '<th class="bv-sort" data-col="name">Artikel' + arrow('name') + '</th>' +
        '<th class="bv-sort" data-col="supplier">Lieferant' + arrow('supplier') + '</th>' +
        '<th class="bv-sort" data-col="masterRef">Masterzutat' + arrow('masterRef') + '</th>' +
        '<th>Gebinde / Basis</th>' +
        '<th class="bv-sort" data-col="price">EK Netto' + arrow('price') + '</th>' +
        '<th class="bv-sort" data-col="refPrice">Ref.-Preis' + arrow('refPrice') + '</th>' +
        '<th>Status</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '</div>';
  }

  function renderPriceRadarTab(d) {
    const issues = Array.isArray(d.priceIssues) ? d.priceIssues : [];
    const rows = issues.length
      ? issues.map(i =>
          '<tr>' +
            '<td><b>' + esc(i.name || i.articleName || i.id || '–') + '</b><div style="font-size:10.5px;color:var(--os-silk);">' + esc(i.supplier || '') + ' · ' + esc(i.id || i.artId || '') + '</div></td>' +
            '<td>' + esc(i.reason || i.type || i.category || 'Preisabweichung') + '</td>' +
            '<td class="tabular">' + fmtEur(i.prevPrice !== undefined ? i.prevPrice : i.oldPrice) + '</td>' +
            '<td class="tabular">' + fmtEur(i.price !== undefined ? i.price : i.newPrice) + '</td>' +
            '<td class="tabular">' + fmtPct(i.diffPct !== undefined ? i.diffPct : i.changePct) + '</td>' +
            '<td>' + (i.isReviewed ? '<span class="badge badge-ok">GEPRÜFT</span>' : '<span class="badge badge-warn">OFFEN</span>') + '</td>' +
            '<td>' +
              (!i.isReviewed && canWrite()
                ? '<button type="button" class="btn btn-primary btn-sm ek-review-btn" data-artid="' + esc(i.id || i.artId) + '">Bestätigen</button>'
                : '<span class="kicker">' + (i.isReviewed ? 'Erledigt' : 'Nur Lesen') + '</span>') +
            '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="7">Keine Preisauffälligkeiten vorhanden.</td></tr>';

    return '<div class="card">' +
      '<div class="card-head"><div><div class="kicker">Preisüberwachung</div><h3>Preisradar (' + esc(issues.length) + ' Hinweise)</h3></div></div>' +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>Artikel</th><th>Auffälligkeit</th><th>Altpreis</th><th>Neupreis</th><th>Änderung</th><th>Status</th><th>Aktion</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '</div>';
  }

  function renderNewArticlesTab(d) {
    const list = Array.isArray(d.newArticles) ? d.newArticles : [];
    const rows = list.length
      ? list.map(a =>
          '<tr>' +
            '<td><b>' + esc(a.name || a.id) + '</b><div style="font-size:10.5px;color:var(--os-silk);">' + esc(a.id) + '</div></td>' +
            '<td>' + esc(a.supplier) + '</td>' +
            '<td>' + esc(a.masterRef || '–') + '</td>' +
            '<td class="tabular">' + fmtEur(a.price) + '</td>' +
            '<td class="tabular">' + esc(a.date || '–') + '</td>' +
            '<td>' +
              (canWrite()
                ? '<button type="button" class="btn btn-primary btn-sm ek-confirm-btn" data-artid="' + esc(a.id) + '">Freigeben</button>'
                : '<span class="kicker">Nur Lesen</span>') +
            '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="6">Alle Scan-Artikel sind bereits geprüft.</td></tr>';

    return '<div class="card">' +
      '<div class="card-head">' +
        '<div><div class="kicker">Beleg-Neuzugänge</div><h3>Ungeprüfte Scan-Artikel (' + esc(list.length) + ')</h3></div>' +
        (list.length && canWrite() ? '<button type="button" class="btn btn-primary btn-sm" id="ekConfirmAllBtn">Alle freigeben</button>' : '') +
      '</div>' +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>Artikel</th><th>Lieferant</th><th>Masterzutat</th><th>EK Netto</th><th>Belegdatum</th><th>Aktion</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '</div>';
  }

  function renderMastersTab(d) {
    const q = EK_STATE.searchQuery.trim().toLowerCase();
    const list = (d.masters || []).filter(m => !q || [m.id, m.name, m.unit].join(' ').toLowerCase().indexOf(q) !== -1);
    const rows = list.length
      ? list.slice(0, 200).map(m =>
          '<tr>' +
            '<td><b>' + esc(m.name || m.id) + '</b><div style="font-size:10.5px;color:var(--os-silk);">' + esc(m.id) + '</div></td>' +
            '<td>' + esc(m.unit || '–') + '</td>' +
            '<td class="tabular">' + fmtEur(m.calcPrice) + '</td>' +
            '<td class="tabular">' + fmtEur(m.kontrollpreis) + '</td>' +
            '<td class="tabular">' + esc(m.mappedCount) + '</td>' +
            '<td>' + statusBadge(m.reviewStatus || 'AKTIV') + '</td>' +
          '</tr>'
        ).join('')
      : '<tr><td colspan="6">Keine Masterzutaten gefunden.</td></tr>';

    return '<div class="card">' +
      '<div class="card-head"><div><div class="kicker">Rezeptur-Referenz</div><h3>Masterzutaten (' + esc(list.length) + ')</h3></div></div>' +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>Masterzutat</th><th>Einheit</th><th>Kalk.-Preis</th><th>Kontrollpreis</th><th>Zugeordnete Artikel</th><th>Status</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '</div>';
  }

  function renderSubTab() {
    const slot = document.getElementById('ekSubTabContent');
    const d = EK_STATE.data;
    if (!slot || !d) return;

    document.querySelectorAll('#ekSubTabs .bv-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === EK_STATE.activeSubTab);
    });

    if (EK_STATE.activeSubTab === 'articles') {
      slot.innerHTML = renderArticlesTab(d);
      const tbl = document.getElementById('ekArticlesTable');
      if (tbl) {
        tbl.querySelectorAll('th.bv-sort').forEach(th => {
          th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (EK_STATE.sortBy === col) {
              EK_STATE.sortDir = EK_STATE.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
              EK_STATE.sortBy = col;
              EK_STATE.sortDir = (col === 'price' || col === 'refPrice') ? 'desc' : 'asc';
            }
            renderSubTab();
          });
        });
      }
    } else if (EK_STATE.activeSubTab === 'radar') {
      slot.innerHTML = renderPriceRadarTab(d);
      slot.querySelectorAll('.ek-review-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = '…';
          try {
            const res = await window.SonaApi.markEinkaufArticleReviewed(EK_STATE.standortId, btn.dataset.artid);
            if (!res || res.success === false) {
              notify('Fehler: ' + ((res && res.error) || 'Bestätigung fehlgeschlagen'));
              btn.disabled = false;
              btn.textContent = 'Bestätigen';
              return;
            }
            clearCache(EK_STATE.standortId);
            notify('Preisprüfung bestätigt.');
            await loadOverview(true);
          } catch (err) {
            notify('Fehler: ' + err.message);
            btn.disabled = false;
            btn.textContent = 'Bestätigen';
          }
        });
      });
    } else if (EK_STATE.activeSubTab === 'new') {
      slot.innerHTML = renderNewArticlesTab(d);
      slot.querySelectorAll('.ek-confirm-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = '…';
          try {
            const res = await window.SonaApi.confirmEinkaufNewArticle(EK_STATE.standortId, btn.dataset.artid);
            if (!res || res.success === false) {
              notify('Fehler: ' + ((res && res.error) || 'Freigabe fehlgeschlagen'));
              btn.disabled = false;
              btn.textContent = 'Freigeben';
              return;
            }
            clearCache(EK_STATE.standortId);
            notify('Artikel freigegeben.');
            await loadOverview(true);
          } catch (err) {
            notify('Fehler: ' + err.message);
            btn.disabled = false;
            btn.textContent = 'Freigeben';
          }
        });
      });
      const btnAll = document.getElementById('ekConfirmAllBtn');
      if (btnAll) {
        btnAll.addEventListener('click', async () => {
          btnAll.disabled = true;
          btnAll.textContent = 'Gibt frei…';
          try {
            const res = await window.SonaApi.confirmAllEinkaufNewArticles(EK_STATE.standortId);
            if (!res || res.success === false) {
              notify('Fehler: ' + ((res && res.error) || 'Freigabe fehlgeschlagen'));
            } else {
              clearCache(EK_STATE.standortId);
              notify('Alle neuen Scan-Artikel freigegeben.');
              await loadOverview(true);
            }
          } catch (err) {
            notify('Fehler: ' + err.message);
          }
        });
      }
    } else if (EK_STATE.activeSubTab === 'masters') {
      slot.innerHTML = renderMastersTab(d);
    }
  }

  function renderFullView(container) {
    const d = EK_STATE.data;
    if (!d) return;
    const suppliers = ['Alle'].concat((d.suppliers || []).map(s => s.name));

    container.innerHTML =
      '<div class="card bv-toolbar-card">' +
        '<div class="bv-toolbar">' +
          '<div class="bv-toolbar-group">' +
            '<select id="ekSupplierSelect" class="input-control bv-ctrl" aria-label="Lieferant">' +
              suppliers.map(s => '<option value="' + esc(s) + '"' + (s === EK_STATE.selectedSupplier ? ' selected' : '') + '>' + esc(s === 'Alle' ? 'Alle Lieferanten' : s) + '</option>').join('') +
            '</select>' +
            '<input id="ekSearchInput" type="search" class="input-control bv-ctrl" placeholder="Artikel / Lieferant / Master suchen …" value="' + esc(EK_STATE.searchQuery) + '">' +
          '</div>' +
          '<div class="bv-toolbar-group">' +
            '<button type="button" class="btn btn-sm" id="ekBtnRefresh">Aktualisieren</button>' +
            (EK_STATE.legacyUrl ? '<a class="btn btn-sm" href="' + esc(EK_STATE.legacyUrl) + '" target="_blank" rel="noopener">Gebinde &amp; Vollansicht ↗</a>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
      renderKpis(d) +
      '<div id="ekSubTabs" class="bv-subtabs">' +
        '<button type="button" class="bv-tab-btn" data-tab="articles">Artikelstamm</button>' +
        '<button type="button" class="bv-tab-btn" data-tab="radar">Preisradar (' + esc((d.counts && d.counts.openPriceIssuesCount) || 0) + ')</button>' +
        '<button type="button" class="bv-tab-btn" data-tab="new">Neue Scan-Artikel (' + esc((d.counts && d.counts.openNewCount) || 0) + ')</button>' +
        '<button type="button" class="bv-tab-btn" data-tab="masters">Masterzutaten</button>' +
      '</div>' +
      '<div id="ekSubTabContent"></div>';

    document.getElementById('ekSupplierSelect').addEventListener('change', ev => {
      EK_STATE.selectedSupplier = ev.target.value;
      renderSubTab();
    });
    document.getElementById('ekSearchInput').addEventListener('input', ev => {
      EK_STATE.searchQuery = ev.target.value;
      if (EK_STATE.searchTimer) clearTimeout(EK_STATE.searchTimer);
      EK_STATE.searchTimer = setTimeout(() => renderSubTab(), 240);
    });
    document.getElementById('ekBtnRefresh').addEventListener('click', () => {
      clearCache(EK_STATE.standortId);
      loadOverview(true);
    });
    document.getElementById('ekSubTabs').addEventListener('click', ev => {
      const btn = ev.target.closest('button[data-tab]');
      if (!btn) return;
      EK_STATE.activeSubTab = btn.dataset.tab;
      renderSubTab();
    });

    renderSubTab();
  }

  async function loadOverview(forceRefresh) {
    const container = document.getElementById('osMainContent');
    if (!container) return;

    const hit = !forceRefresh && EK_CACHE[EK_STATE.standortId];
    if (hit && (Date.now() - hit.ts) < CACHE_TTL_MS) {
      EK_STATE.data = hit.data;
      renderFullView(container);
      return;
    }

    container.innerHTML = '<div class="card"><div class="kicker">Ebene 0 · ' + esc(EK_STATE.standortName) + '</div><h3>Lade Einkauf &amp; Belege …</h3><p class="module-desc">Artikelstamm, Preisradar &amp; Scan-Artikel werden autorisiert geladen.</p></div>';
    window.SonaLoader.show(900);
    try {
      const res = await window.SonaApi.getEinkaufOverview(EK_STATE.standortId, forceRefresh);
      if (!res || res.success === false) {
        container.innerHTML = '<div class="card"><div class="kicker">Ebene 0 · Fehler</div><h3>Einkauf konnte nicht geladen werden</h3><p class="module-desc">' + esc((res && res.error) || 'Unbekannter Fehler') + '</p></div>';
        return;
      }
      EK_STATE.data = res;
      EK_CACHE[EK_STATE.standortId] = { ts: Date.now(), data: res };
      renderFullView(container);
    } catch (err) {
      container.innerHTML = '<div class="card"><div class="kicker">Verbindungsfehler</div><h3>Gateway nicht erreichbar</h3><p class="module-desc">' + esc(err.message) + '</p></div>';
    } finally {
      window.SonaLoader.hide();
    }
  }

  window.SonaEinkaufModule = {
    mount: function(session, mod) {
      const changedLoc = EK_STATE.standortId !== session.standortId;
      EK_STATE.standortId = session.standortId;
      EK_STATE.standortName = session.standortName;
      EK_STATE.permissions = session.permissions;
      EK_STATE.legacyUrl = (mod && mod.legacyUrl) || '';
      if (changedLoc) {
        EK_STATE.selectedSupplier = 'Alle';
        EK_STATE.searchQuery = '';
      }
      return loadOverview(false);
    },
    clearCache: clearCache
  };
})();
