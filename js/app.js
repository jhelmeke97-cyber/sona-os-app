'use strict';

(function() {
  const STATE = {
    session: null,
    activeView: 'overview',
    pinBuffer: '',
    users: [],
    rbacEntries: [],
    tabCatalog: { rezeptur: [], einkauf: [], operations: [] },
    openPillars: { WARENWIRTSCHAFT: false, CONTROLLING: false, OPERATIONS: false },
    sidebarCollapsed: false,
    deferredInstallPrompt: null
  };

  function shortLocName(name) {
    return String(name || '').replace(/^sona\s+/i, '').trim() || String(name || '');
  }

  function $(id) {
    return document.getElementById(id);
  }

  function esc(val) {
    return String(val == null ? '' : val).replace(/[&<>"']/g, function(m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function showToast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.25s ease';
      setTimeout(() => el.remove(), 260);
    }, 3400);
  }

  function updatePinDots() {
    const box = $('pinDots');
    if (!box) return;
    const len = STATE.pinBuffer.length;
    const slots = Math.max(4, Math.min(8, len || 4));
    let html = '';
    for (let i = 0; i < slots; i++) {
      html += '<span class="pin-dot' + (i < len ? ' filled' : '') + '"></span>';
    }
    box.innerHTML = html;
  }

  function setLockError(msg) {
    const el = $('lockError');
    if (!el) return;
    if (!msg) {
      el.classList.add('hidden');
      el.textContent = '';
    } else {
      el.textContent = msg;
      el.classList.remove('hidden');
    }
  }

  function clearAllModuleCaches() {
    if (window.SonaBestandModule) window.SonaBestandModule.clearCache();
    if (window.SonaControllingModule) window.SonaControllingModule.clearCache();
    if (window.SonaEinkaufModule) window.SonaEinkaufModule.clearCache();
    if (window.SonaRezepturModule) window.SonaRezepturModule.clearCache();
  }

  function lockApp(reasonMsg) {
    window.SonaApi.setToken('');
    STATE.session = null;
    STATE.rbacEntries = [];
    STATE.pinBuffer = '';
    clearAllModuleCaches();
    updatePinDots();
    $('osAppShell').classList.add('hidden');
    $('osNavList').innerHTML = '';
    $('osMobileNav').innerHTML = '';
    $('osMainContent').innerHTML = '';
    $('lockScreen').classList.remove('hidden');
    setLockError(reasonMsg || '');
    loadLockUsers();
  }

  async function loadLockUsers() {
    const sel = $('lockUserSelect');
    const locSel = $('lockLocationSelect');
    if (locSel) {
      locSel.innerHTML = window.SONA_OS_DEFAULTS.LOCATIONS.map(l =>
        '<option value="' + esc(l.id) + '">' + esc(l.name) + ' (' + esc(l.id) + ')</option>'
      ).join('');
    }
    try {
      const res = await window.SonaApi.listUsers();
      if (!res || !res.success) {
        throw new Error((res && res.error) || 'Benutzerliste konnte nicht geladen werden.');
      }
      STATE.users = res.users || [];
      if (locSel && Array.isArray(res.locations) && res.locations.length) {
        locSel.innerHTML = res.locations.map(l =>
          '<option value="' + esc(l.id) + '">' + esc(l.name) + ' (' + esc(l.id) + ')</option>'
        ).join('');
      }
      if (sel) {
        sel.innerHTML = STATE.users.length
          ? STATE.users.map(u => '<option value="' + esc(u.id) + '">' + esc(u.name) + ' (' + esc(u.role) + ')</option>').join('')
          : '<option value="">Keine aktiven Benutzer gefunden</option>';
      }
    } catch (err) {
      setLockError('Gateway-Verbindung fehlgeschlagen: ' + (err && err.message ? err.message : String(err)));
    }
  }

  async function submitLogin() {
    const userId = ($('lockUserSelect') && $('lockUserSelect').value) || '';
    const standortId = ($('lockLocationSelect') && $('lockLocationSelect').value) || '001';
    const pin = STATE.pinBuffer;

    if (!userId) {
      setLockError('Bitte Benutzer auswählen.');
      return;
    }
    if (!pin) {
      setLockError('Bitte PIN eingeben.');
      return;
    }

    setLockError('');
    window.SonaLoader.show(0);
    try {
      const res = await window.SonaApi.login(userId, pin, standortId);
      if (!res || !res.success || !res.token) {
        STATE.pinBuffer = '';
        updatePinDots();
        setLockError((res && res.error) || 'Anmeldung fehlgeschlagen.');
        return;
      }
      window.SonaApi.setToken(res.token);
      STATE.session = res;
      STATE.pinBuffer = '';
      STATE.activeView = 'overview';
      renderAuthenticatedShell();
    } catch (err) {
      STATE.pinBuffer = '';
      updatePinDots();
      setLockError('Verbindungsfehler: ' + (err && err.message ? err.message : String(err)));
    } finally {
      window.SonaLoader.hide();
    }
  }

  function renderAuthenticatedShell() {
    const s = STATE.session;
    if (!s || !s.permissions) {
      lockApp();
      return;
    }

    $('lockScreen').classList.add('hidden');
    $('osAppShell').classList.remove('hidden');

    const mods = s.ecosystemModules || [];
    const navItems = [
      { key: 'overview', title: 'Startseite', pillar: 'ROOT' }
    ].concat(mods.map(m => ({ key: 'mod_' + m.key, title: m.title, pillar: m.pillar || 'WARENWIRTSCHAFT' })));

    if (s.permissions.adminMatrix) {
      navItems.push({ key: 'rbac', title: 'Rechte-Matrix', pillar: 'ADMIN' });
    }

    if (!navItems.some(x => x.key === STATE.activeView)) {
      STATE.activeView = 'overview';
    }

    const pillarGroups = [
      { id: 'WARENWIRTSCHAFT', label: 'Warenwirtschaft' },
      { id: 'CONTROLLING', label: 'Controlling' },
      { id: 'OPERATIONS', label: 'Operations' }
    ];

    let navHtml =
      '<button type="button" class="os-nav-btn' + (STATE.activeView === 'overview' ? ' active' : '') + '" data-view="overview">' +
        '<span>Startseite</span>' +
      '</button>';

    navHtml += pillarGroups.map(group => {
      const items = navItems.filter(it => it.pillar === group.id);
      if (!items.length) return '';
      const isOpen = !!STATE.openPillars[group.id] || items.some(it => it.key === STATE.activeView);
      STATE.openPillars[group.id] = isOpen;
      return '<div class="os-nav-group' + (isOpen ? ' open' : '') + '" data-pillar="' + esc(group.id) + '">' +
        '<button type="button" class="os-nav-group-btn" data-toggle-pillar="' + esc(group.id) + '">' +
          '<span>' + esc(group.label) + '</span>' +
          '<span class="os-nav-chevron">▸</span>' +
        '</button>' +
        '<div class="os-nav-group-items">' +
          items.map(item =>
            '<button type="button" class="os-nav-btn' + (STATE.activeView === item.key ? ' active' : '') + '" data-view="' + esc(item.key) + '">' +
              '<span>' + esc(item.title) + '</span>' +
            '</button>'
          ).join('') +
        '</div>' +
      '</div>';
    }).join('');

    if (s.permissions.adminMatrix) {
      navHtml +=
        '<div class="os-nav-divider"></div>' +
        '<button type="button" class="os-nav-btn' + (STATE.activeView === 'rbac' ? ' active' : '') + '" data-view="rbac">' +
          '<span>Rechte-Matrix</span>' +
        '</button>';
    }

    $('osNavList').innerHTML = navHtml;

    $('osMobileNav').innerHTML = navItems.map(item =>
      '<button type="button" class="' + (STATE.activeView === item.key ? 'active' : '') + '" data-view="' + esc(item.key) + '">' +
        esc(item.title) +
      '</button>'
    ).join('');

    $('sidebarUserMeta').innerHTML =
      '<div style="font-weight:600;color:var(--os-cream);font-size:13px;">' + esc(s.user.name) + '</div>' +
      '<div style="font-size:11px;color:var(--os-silk);">' + esc(s.user.role) + '</div>';

    const locSelect = $('globalLocationSelect');
    const allowedLocs = s.locations || [{ id: s.standortId, name: s.standortName }];
    locSelect.innerHTML = allowedLocs.map(l =>
      '<option value="' + esc(l.id) + '"' + (l.id === s.standortId ? ' selected' : '') + '>' + esc(shortLocName(l.name)) + '</option>'
    ).join('');
    locSelect.disabled = allowedLocs.length <= 1;

    renderActiveView();
  }

  function renderActiveView() {
    const s = STATE.session;
    if (!s) return;

    const mainEl = $('osMainContent');
    if (mainEl) mainEl.classList.remove('os-content-fullbleed');

    document.querySelectorAll('#osNavList .os-nav-btn, #osMobileNav button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === STATE.activeView);
    });

    if (STATE.activeView === 'overview') {
      renderOverview();
      return;
    }
    if (STATE.activeView === 'rbac' && s.permissions.adminMatrix) {
      renderRbacMatrixView();
      return;
    }
    if (STATE.activeView.indexOf('mod_') === 0) {
      const modKey = STATE.activeView.slice(4);
      const mod = (s.ecosystemModules || []).find(m => m.key === modKey);
      if (mod) {
        const grp = document.querySelector('#osNavList .os-nav-group[data-pillar="' + (mod.pillar || 'WARENWIRTSCHAFT') + '"]');
        if (grp) {
          grp.classList.add('open');
          STATE.openPillars[mod.pillar || 'WARENWIRTSCHAFT'] = true;
        }
        if (mod.key === 'operations' && window.SonaOperationsModule) {
          window.SonaOperationsModule.mount(s, mod);
        } else {
          renderEmbeddedModuleView(mod);
        }
        return;
      }
    }

    STATE.activeView = 'overview';
    renderOverview();
  }

  async function renderEmbeddedModuleView(mod) {
    const s = STATE.session;
    const container = $('osMainContent');
    if (!container || !s) return;

    container.classList.add('os-content-fullbleed');
    container.innerHTML = '';
    window.SonaLoader.show(350);

    try {
      const res = await window.SonaApi.getModuleLaunchUrl(mod.key, s.standortId);
      if (!res || !res.success || !res.launchUrl) {
        container.classList.remove('os-content-fullbleed');
        container.innerHTML =
          '<div class="card">' +
            '<h3>' + esc(mod.title) + ' konnte nicht gestartet werden</h3>' +
            '<p class="module-desc">' + esc((res && res.error) || 'Zugriff verweigert oder Verbindungsfehler.') + '</p>' +
          '</div>';
        window.SonaLoader.hide();
        return;
      }

      const iframe = document.createElement('iframe');
      iframe.className = 'os-module-frame';
      iframe.title = mod.title;
      iframe.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen');
      iframe.addEventListener('load', () => window.SonaLoader.hide());
      iframe.src = res.launchUrl;
      container.innerHTML = '';
      container.appendChild(iframe);
      setTimeout(() => window.SonaLoader.hide(), 8000);
    } catch (err) {
      container.classList.remove('os-content-fullbleed');
      container.innerHTML =
        '<div class="card">' +
          '<h3>Verbindungsfehler</h3>' +
          '<p class="module-desc">' + esc(err && err.message ? err.message : String(err)) + '</p>' +
        '</div>';
      window.SonaLoader.hide();
    }
  }

  function renderOverview() {
    const s = STATE.session;
    const mods = s.ecosystemModules || [];
    const container = $('osMainContent');

    const renderTile = m =>
      '<button type="button" class="home-tile" onclick="window.SonaApp.openView(\'mod_' + esc(m.key) + '\')">' +
        '<div class="home-tile-head">' +
          '<h4 class="home-tile-title">' + esc(m.title) + '</h4>' +
          '<span class="home-tile-arrow">→</span>' +
        '</div>' +
        '<p class="home-tile-desc">' + esc(m.subtitle) + '</p>' +
      '</button>';

    const pillars = [
      { id: 'WARENWIRTSCHAFT', title: 'Warenwirtschaft' },
      { id: 'CONTROLLING', title: 'Controlling' },
      { id: 'OPERATIONS', title: 'Operations' }
    ];

    const pillarsHtml = pillars.map(p => {
      const pMods = mods.filter(m => (m.pillar || 'WARENWIRTSCHAFT') === p.id);
      if (!pMods.length) return '';
      const gridCls = pMods.length >= 3 ? 'grid-3' : 'grid-2';
      return '<section class="pillar-section">' +
        '<div class="pillar-head"><h3>' + esc(p.title) + '</h3></div>' +
        '<div class="' + gridCls + '">' + pMods.map(renderTile).join('') + '</div>' +
      '</section>';
    }).join('');

    container.innerHTML =
      '<div class="os-home-greeting">' +
        '<h2>Willkommen, ' + esc(s.user.name) + '</h2>' +
      '</div>' +
      (pillarsHtml || '<div class="card"><p>Für deinen Benutzer sind aktuell noch keine Bereiche freigegeben.</p></div>');
  }

  function renderModuleBridgeView(mod) {
    const s = STATE.session;
    $('osMainContent').innerHTML =
      '<div class="card">' +
        '<div class="card-head">' +
          '<div>' +
            '<div class="kicker">' + esc(mod.ebene) + ' · Autorisiert für ' + esc(s.standortName) + ' (' + esc(s.standortId) + ')</div>' +
            '<h3>' + esc(mod.title) + '</h3>' +
          '</div>' +
          '<span class="badge badge-info">' + esc(mod.phase) + '</span>' +
        '</div>' +
        '<p class="module-desc" style="margin-bottom:16px;">' + esc(mod.subtitle) + '</p>' +
        '<p class="module-desc" style="margin-bottom:18px;">Die Zugriffs- und Standortprüfung in SONA OS ist für dieses Modul bereits aktiv. Während die nativen JSON-Oberflächen in den nächsten Phasen hier direkt eingezogen werden, öffnet der Button unten weiterhin direkt das produktive Modul.</p>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
          '<a class="btn btn-primary" href="' + esc(mod.legacyUrl) + '" target="_blank" rel="noopener">Produktive Ebene öffnen ↗</a>' +
          '<button type="button" class="btn" onclick="window.SonaApp.openView(\'overview\')">Zurück zur Übersicht</button>' +
        '</div>' +
      '</div>';
  }

  async function renderRbacMatrixView() {
    const container = $('osMainContent');
    container.innerHTML =
      '<div class="card">' +
        '<div class="card-head">' +
          '<div><div class="kicker">Administration</div><h3>Mitarbeiter- &amp; Tab-Rechte-Matrix</h3></div>' +
          '<button type="button" class="btn btn-sm" id="btnReloadRbac">Aktualisieren</button>' +
        '</div>' +
        '<p class="module-desc" style="margin-bottom:14px;">Steuere pro Mitarbeiter die Hauptmodule, Standorte, Zugriffsstufe und über <b>Tabs ▾</b> die feingranularen Tab-Freigaben (Gesamtfreigabe oder Teilzugriff für Rezepturen &amp; Einkauf).</p>' +
        '<div class="table-wrap"><table id="rbacTable"><thead><tr>' +
          '<th>Benutzer</th><th>Rolle</th><th>Einkauf</th><th>Rezepturen</th><th>Controlling</th><th>Bestand</th><th>Admin</th><th>Standorte</th><th>Stufe</th><th>Tab-Details</th><th>Aktion</th>' +
        '</tr></thead><tbody id="rbacBody"><tr><td colspan="11">Lade Rechte-Matrix …</td></tr></tbody></table></div>' +
      '</div>';

    $('btnReloadRbac').addEventListener('click', loadRbacTable);
    await loadRbacTable();
  }

  function renderTabPermissionBox(idx, modKey, title, catalog, currentVal) {
    const isAll = !Array.isArray(currentVal);
    const list = Array.isArray(currentVal) ? currentVal : catalog.map(t => t.id);
    return '<div class="rbac-tabs-box" data-tabmod="' + esc(modKey) + '">' +
      '<div class="rbac-tabs-box-head">' +
        '<b>' + esc(title) + '</b>' +
        '<label style="font-size:11.5px;color:var(--os-cream);display:inline-flex;align-items:center;gap:6px;cursor:pointer;">' +
          '<input type="checkbox" class="rbac-tab-all" data-idx="' + idx + '" data-tabmod="' + esc(modKey) + '"' + (isAll ? ' checked' : '') + '> Gesamtfreigabe (Alle Tabs)' +
        '</label>' +
      '</div>' +
      '<div class="rbac-tab-chips' + (isAll ? ' disabled' : '') + '">' +
        catalog.map(t =>
          '<label class="rbac-tab-chip">' +
            '<input type="checkbox" class="rbac-tab-item" data-tabmod="' + esc(modKey) + '" value="' + esc(t.id) + '"' + (list.indexOf(t.id) !== -1 ? ' checked' : '') + '>' +
            '<span>' + esc(t.label) + '</span>' +
          '</label>'
        ).join('') +
      '</div>' +
    '</div>';
  }

  async function loadRbacTable() {
    const tbody = $('rbacBody');
    if (!tbody) return;
    window.SonaLoader.show(900);
    try {
      const res = await window.SonaApi.getRbacMatrix();
      if (!res || !res.success) {
        tbody.innerHTML = '<tr><td colspan="11">' + esc((res && res.error) || 'Fehler beim Laden.') + '</td></tr>';
        return;
      }
      STATE.rbacEntries = res.entries || [];
      STATE.tabCatalog = res.tabCatalog || { rezeptur: [], einkauf: [], operations: [] };
      const allLocations = (Array.isArray(res.locations) && res.locations.length)
        ? res.locations
        : window.SONA_OS_DEFAULTS.LOCATIONS;

      tbody.innerHTML = STATE.rbacEntries.map((u, idx) => {
        const locs = u.allowedLocations || [];
        const tp = u.tabPermissions || { rezeptur: 'ALL', einkauf: 'ALL', operations: 'ALL' };
        const isPartial = Array.isArray(tp.rezeptur) || Array.isArray(tp.einkauf) || Array.isArray(tp.operations);
        return '<tr class="rbac-main-row" data-idx="' + idx + '" data-uid="' + esc(u.userId) + '">' +
          '<td><b>' + esc(u.displayName) + '</b><div style="font-size:10.5px;color:var(--os-silk);">' + esc(u.userId) + (u.active ? '' : ' · DEAKTIVIERT') + '</div></td>' +
          '<td>' + esc(u.role) + '</td>' +
          '<td class="chk-cell"><input type="checkbox" class="rbac-mod" data-mod="einkauf"' + (u.modules.einkauf ? ' checked' : '') + '></td>' +
          '<td class="chk-cell"><input type="checkbox" class="rbac-mod" data-mod="rezeptur"' + (u.modules.rezeptur ? ' checked' : '') + '></td>' +
          '<td class="chk-cell"><input type="checkbox" class="rbac-mod" data-mod="controlling"' + (u.modules.controlling ? ' checked' : '') + '></td>' +
          '<td class="chk-cell"><input type="checkbox" class="rbac-mod" data-mod="bestand"' + (u.modules.bestand ? ' checked' : '') + '></td>' +
          '<td class="chk-cell"><input type="checkbox" class="rbac-admin"' + (u.adminMatrix ? ' checked' : '') + '></td>' +
          '<td><div class="loc-chks">' +
            allLocations.map(l =>
              '<label title="' + esc(l.name) + '"><input type="checkbox" class="rbac-loc" value="' + esc(l.id) + '"' + (locs.indexOf(l.id) !== -1 ? ' checked' : '') + '> ' + esc(l.id) + '</label>'
            ).join('') +
          '</div></td>' +
          '<td><select class="input-control rbac-level" style="height:30px;min-width:86px;">' +
            ['READ', 'WRITE', 'ADMIN'].map(lvl => '<option value="' + lvl + '"' + (u.accessLevel === lvl ? ' selected' : '') + '>' + lvl + '</option>').join('') +
          '</select></td>' +
          '<td><button type="button" class="btn btn-sm rbac-tabs-toggle" data-idx="' + idx + '">' + (isPartial ? 'Teilzugriff ▾' : 'Alle Tabs ▾') + '</button></td>' +
          '<td><button type="button" class="btn btn-primary btn-sm rbac-save-btn">Speichern</button></td>' +
        '</tr>' +
        '<tr class="rbac-tabs-row hidden" data-tabs-for="' + idx + '">' +
          '<td colspan="11">' +
            '<div class="rbac-tabs-grid">' +
              renderTabPermissionBox(idx, 'rezeptur', 'Rezepturen – Tab-Freigaben', STATE.tabCatalog.rezeptur || [], tp.rezeptur) +
              renderTabPermissionBox(idx, 'einkauf', 'Einkauf – Tab-Freigaben', STATE.tabCatalog.einkauf || [], tp.einkauf) +
              renderTabPermissionBox(idx, 'operations', 'Operations – Schwund & Bruch', STATE.tabCatalog.operations || [], tp.operations) +
            '</div>' +
          '</td>' +
        '</tr>';
      }).join('');

      tbody.querySelectorAll('.rbac-tabs-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const detailRow = tbody.querySelector('tr.rbac-tabs-row[data-tabs-for="' + btn.dataset.idx + '"]');
          if (detailRow) detailRow.classList.toggle('hidden');
        });
      });

      tbody.querySelectorAll('.rbac-tab-all').forEach(chk => {
        chk.addEventListener('change', () => {
          const box = chk.closest('.rbac-tabs-box');
          const chips = box && box.querySelector('.rbac-tab-chips');
          if (chips) chips.classList.toggle('disabled', chk.checked);
        });
      });

      tbody.querySelectorAll('.rbac-save-btn').forEach(btn => {
        btn.addEventListener('click', () => saveRbacRow(btn.closest('tr')));
      });
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="11">Fehler: ' + esc(err.message) + '</td></tr>';
    } finally {
      window.SonaLoader.hide();
    }
  }

  async function saveRbacRow(tr) {
    if (!tr) return;
    const idx = parseInt(tr.dataset.idx, 10);
    const orig = STATE.rbacEntries[idx];
    if (!orig) return;

    const modules = {};
    tr.querySelectorAll('.rbac-mod').forEach(chk => {
      modules[chk.dataset.mod] = chk.checked;
    });
    const allowedLocations = [];
    tr.querySelectorAll('.rbac-loc').forEach(chk => {
      if (chk.checked) allowedLocations.push(chk.value);
    });
    const adminMatrix = tr.querySelector('.rbac-admin').checked;
    const accessLevel = tr.querySelector('.rbac-level').value;

    const tabPermissions = { rezeptur: 'ALL', einkauf: 'ALL', operations: 'ALL' };
    const detailRow = document.querySelector('#rbacBody tr.rbac-tabs-row[data-tabs-for="' + idx + '"]');
    if (detailRow) {
      ['rezeptur', 'einkauf', 'operations'].forEach(modKey => {
        const box = detailRow.querySelector('.rbac-tabs-box[data-tabmod="' + modKey + '"]');
        if (!box) return;
        const allChk = box.querySelector('.rbac-tab-all');
        if (allChk && allChk.checked) {
          tabPermissions[modKey] = 'ALL';
        } else {
          const picked = [];
          box.querySelectorAll('.rbac-tab-item:checked').forEach(c => picked.push(c.value));
          tabPermissions[modKey] = picked;
        }
      });
    }

    if (!allowedLocations.length) {
      showToast('Mindestens ein Standort muss aktiviert sein.');
      return;
    }

    const saveBtn = tr.querySelector('.rbac-save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Speichert…';

    try {
      const res = await window.SonaApi.saveRbacRule({
        userId: orig.userId,
        displayName: orig.displayName,
        role: orig.role,
        modules: modules,
        adminMatrix: adminMatrix,
        allowedLocations: allowedLocations,
        accessLevel: accessLevel,
        tabPermissions: tabPermissions
      });
      if (!res || !res.success) {
        showToast('Fehler: ' + ((res && res.error) || 'Speichern fehlgeschlagen'));
        return;
      }
      showToast('Rechte für ' + orig.displayName + ' gespeichert.');
      if (orig.userId === STATE.session.user.id) {
        const refreshed = await window.SonaApi.checkSession();
        if (refreshed && refreshed.success) {
          STATE.session = Object.assign({}, STATE.session, refreshed);
          renderAuthenticatedShell();
          return;
        }
      }
      await loadRbacTable();
    } catch (err) {
      showToast('Fehler: ' + err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Speichern';
    }
  }

  function bindGlobalUiEvents() {
    document.querySelectorAll('#numpadGrid .numpad-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const digit = btn.dataset.digit;
        const action = btn.dataset.action;
        if (digit !== undefined) {
          if (STATE.pinBuffer.length < 12) {
            STATE.pinBuffer += digit;
            updatePinDots();
          }
        } else if (action === 'back') {
          STATE.pinBuffer = STATE.pinBuffer.slice(0, -1);
          updatePinDots();
        } else if (action === 'clear') {
          STATE.pinBuffer = '';
          updatePinDots();
        }
      });
    });

    $('btnLoginSubmit').addEventListener('click', submitLogin);

    document.addEventListener('keydown', ev => {
      if ($('lockScreen').classList.contains('hidden')) return;
      if (!$('gatewayModal').classList.contains('hidden')) return;
      if (/^[0-9]$/.test(ev.key)) {
        if (STATE.pinBuffer.length < 12) {
          STATE.pinBuffer += ev.key;
          updatePinDots();
        }
      } else if (ev.key === 'Backspace') {
        STATE.pinBuffer = STATE.pinBuffer.slice(0, -1);
        updatePinDots();
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        submitLogin();
      }
    });

    const handleNavClick = ev => {
      const groupBtn = ev.target.closest('button[data-toggle-pillar]');
      if (groupBtn) {
        const pillarId = groupBtn.dataset.togglePillar;
        const grpEl = groupBtn.closest('.os-nav-group');
        const nextOpen = !(grpEl && grpEl.classList.contains('open'));
        STATE.openPillars[pillarId] = nextOpen;
        if (grpEl) grpEl.classList.toggle('open', nextOpen);
        return;
      }
      const btn = ev.target.closest('button[data-view]');
      if (!btn) return;
      STATE.activeView = btn.dataset.view;
      renderActiveView();
    };
    $('osNavList').addEventListener('click', handleNavClick);
    $('osMobileNav').addEventListener('click', handleNavClick);

    const applySidebarCollapsed = collapsed => {
      STATE.sidebarCollapsed = !!collapsed;
      const shell = $('osAppShell');
      const toggleBtn = $('btnToggleSidebar');
      if (shell) shell.classList.toggle('sidebar-collapsed', STATE.sidebarCollapsed);
      if (toggleBtn) toggleBtn.textContent = STATE.sidebarCollapsed ? '›' : '‹';
      try { localStorage.setItem('sona_os_sidebar_collapsed', STATE.sidebarCollapsed ? '1' : '0'); } catch (e) {}
    };

    try {
      if (localStorage.getItem('sona_os_sidebar_collapsed') === '1') {
        applySidebarCollapsed(true);
      }
    } catch (e) {}

    const btnToggle = $('btnToggleSidebar');
    if (btnToggle) {
      btnToggle.addEventListener('click', () => applySidebarCollapsed(!STATE.sidebarCollapsed));
    }
    const btnBrandHome = $('btnBrandHome');
    if (btnBrandHome) {
      btnBrandHome.addEventListener('click', () => {
        STATE.activeView = 'overview';
        renderActiveView();
      });
    }

    $('globalLocationSelect').addEventListener('change', async ev => {
      const targetLoc = ev.target.value;
      window.SonaLoader.show(600);
      try {
        const res = await window.SonaApi.switchLocation(targetLoc);
        if (!res || !res.success || !res.token) {
          showToast('Standortwechsel blockiert: ' + ((res && res.error) || ''));
          renderAuthenticatedShell();
          return;
        }
        window.SonaApi.setToken(res.token);
        STATE.session = res;
        clearAllModuleCaches();
        renderAuthenticatedShell();
        showToast('Standort aktiv: ' + res.standortName);
      } catch (err) {
        showToast('Fehler beim Standortwechsel: ' + err.message);
      } finally {
        window.SonaLoader.hide();
      }
    });

    $('btnLockLogout').addEventListener('click', () => lockApp('Sitzung gesperrt.'));

    $('btnOpenGatewaySettings').addEventListener('click', () => {
      $('gatewayUrlInput').value = window.SonaApi.getGatewayUrl();
      $('gatewayModal').classList.remove('hidden');
    });
    $('btnCloseGatewayModal').addEventListener('click', () => $('gatewayModal').classList.add('hidden'));
    $('btnResetGatewayUrl').addEventListener('click', () => {
      const def = window.SonaApi.setGatewayUrl('');
      $('gatewayUrlInput').value = def;
      showToast('Standard-Gateway-URL wiederhergestellt.');
    });
    $('btnSaveGatewayUrl').addEventListener('click', () => {
      try {
        window.SonaApi.setGatewayUrl($('gatewayUrlInput').value);
        $('gatewayModal').classList.add('hidden');
        loadLockUsers();
        showToast('Gateway-URL gespeichert.');
      } catch (err) {
        showToast(err.message);
      }
    });

    window.addEventListener('beforeinstallprompt', ev => {
      ev.preventDefault();
      STATE.deferredInstallPrompt = ev;
      const btn = $('btnInstallPwa');
      if (btn) btn.classList.remove('hidden');
    });

    $('btnInstallPwa').addEventListener('click', async () => {
      if (!STATE.deferredInstallPrompt) return;
      STATE.deferredInstallPrompt.prompt();
      await STATE.deferredInstallPrompt.userChoice;
      STATE.deferredInstallPrompt = null;
      $('btnInstallPwa').classList.add('hidden');
    });
  }

  async function init() {
    window.SonaLoader.init();
    window.SonaLoader.show(0);
    updatePinDots();
    bindGlobalUiEvents();

    window.SonaApi.setUnauthorizedHandler(msg => {
      lockApp(msg || 'Sitzung abgelaufen – bitte erneut mit PIN entsperren.');
    });
    window.addEventListener('offline', () => showToast('Offline – Verbindung zum SONA Gateway unterbrochen.'));
    window.addEventListener('online', () => showToast('Verbindung wiederhergestellt.'));

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    try {
      const existingToken = window.SonaApi.getToken();
      if (existingToken) {
        const sess = await window.SonaApi.checkSession();
        if (sess && sess.success) {
          STATE.session = sess;
          renderAuthenticatedShell();
          return;
        }
      }
      await loadLockUsers();
    } finally {
      window.SonaLoader.hide();
    }
  }

  window.SonaApp = {
    openView: function(viewKey) {
      STATE.activeView = viewKey;
      renderActiveView();
    },
    toast: showToast
  };

  document.addEventListener('DOMContentLoaded', init);
})();
