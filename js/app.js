'use strict';

(function() {
  const STATE = {
    session: null,
    activeView: 'overview',
    pinBuffer: '',
    users: [],
    rbacEntries: [],
    deferredInstallPrompt: null
  };

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

    const pillarOrder = [
      { id: 'ROOT', label: '' },
      { id: 'WARENWIRTSCHAFT', label: 'Warenwirtschaft' },
      { id: 'CONTROLLING', label: 'Controlling' },
      { id: 'OPERATIONS', label: 'Operations' },
      { id: 'ADMIN', label: 'Administration' }
    ];

    $('osNavList').innerHTML = pillarOrder.map(group => {
      const items = navItems.filter(it => it.pillar === group.id);
      if (!items.length) return '';
      const heading = group.label ? '<div class="os-nav-section-label">' + esc(group.label) + '</div>' : '';
      return heading + items.map(item =>
        '<button type="button" class="os-nav-btn' + (STATE.activeView === item.key ? ' active' : '') + '" data-view="' + esc(item.key) + '">' +
          '<span>' + esc(item.title) + '</span>' +
        '</button>'
      ).join('');
    }).join('');

    $('osMobileNav').innerHTML = navItems.map(item =>
      '<button type="button" class="' + (STATE.activeView === item.key ? 'active' : '') + '" data-view="' + esc(item.key) + '">' +
        esc(item.title) +
      '</button>'
    ).join('');

    $('sidebarUserMeta').innerHTML =
      '<div class="kicker">Angemeldet</div>' +
      '<div style="font-weight:600;color:var(--os-cream);margin-top:2px;">' + esc(s.user.name) + '</div>' +
      '<div style="font-size:11px;color:var(--os-silk);">Rolle: ' + esc(s.user.role) + ' · Stufe: ' + esc(s.permissions.accessLevel) + '</div>';

    const locSelect = $('globalLocationSelect');
    const allowedLocs = s.locations || [{ id: s.standortId, name: s.standortName }];
    locSelect.innerHTML = allowedLocs.map(l =>
      '<option value="' + esc(l.id) + '"' + (l.id === s.standortId ? ' selected' : '') + '>' + esc(l.name) + ' (' + esc(l.id) + ')</option>'
    ).join('');
    locSelect.disabled = allowedLocs.length <= 1;

    $('topbarUserBadge').textContent = s.user.name + ' · ' + s.user.role;
    $('topbarLocationBadge').textContent = s.standortName + ' (' + s.standortId + ')';

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
      $('activeViewTitle').textContent = 'Startseite';
      renderOverview();
      return;
    }
    if (STATE.activeView === 'rbac' && s.permissions.adminMatrix) {
      $('activeViewTitle').textContent = 'Rechte-Matrix';
      renderRbacMatrixView();
      return;
    }
    if (STATE.activeView.indexOf('mod_') === 0) {
      const modKey = STATE.activeView.slice(4);
      const mod = (s.ecosystemModules || []).find(m => m.key === modKey);
      if (mod) {
        $('activeViewTitle').textContent = mod.title;
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
        '<span class="badge">' + esc(s.standortName) + ' (' + esc(s.standortId) + ')</span>' +
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
          '<div><div class="kicker">Administration</div><h3>Zentrale Rechte-Matrix (pro Benutzer &amp; Standort)</h3></div>' +
          '<button type="button" class="btn btn-sm" id="btnReloadRbac">Aktualisieren</button>' +
        '</div>' +
        '<p class="module-desc" style="margin-bottom:14px;">Änderungen greifen sofort serverseitig bei jedem Session-Check und API-Aufruf (Gespeichert im Tab „SONA_OS_RECHTEMATRIX“).</p>' +
        '<div class="table-wrap"><table id="rbacTable"><thead><tr>' +
          '<th>Benutzer</th><th>Rolle</th><th>Einkauf</th><th>Rezeptur</th><th>Controlling</th><th>Bestand</th><th>Admin</th><th>Standorte</th><th>Stufe</th><th>Quelle</th><th>Aktion</th>' +
        '</tr></thead><tbody id="rbacBody"><tr><td colspan="11">Lade Rechte-Matrix …</td></tr></tbody></table></div>' +
      '</div>';

    $('btnReloadRbac').addEventListener('click', loadRbacTable);
    await loadRbacTable();
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
      const allLocations = (Array.isArray(res.locations) && res.locations.length)
        ? res.locations
        : window.SONA_OS_DEFAULTS.LOCATIONS;
      tbody.innerHTML = STATE.rbacEntries.map((u, idx) => {
        const locs = u.allowedLocations || [];
        return '<tr data-idx="' + idx + '" data-uid="' + esc(u.userId) + '">' +
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
          '<td><select class="input-control rbac-level" style="height:30px;min-width:92px;">' +
            ['READ', 'WRITE', 'ADMIN'].map(lvl => '<option value="' + lvl + '"' + (u.accessLevel === lvl ? ' selected' : '') + '>' + lvl + '</option>').join('') +
          '</select></td>' +
          '<td><span class="badge ' + (u.source === 'CUSTOM_MATRIX' ? 'badge-ok' : '') + '">' + esc(u.source === 'CUSTOM_MATRIX' ? 'Individuell' : 'Standard') + '</span></td>' +
          '<td><button type="button" class="btn btn-primary btn-sm rbac-save-btn">Speichern</button></td>' +
        '</tr>';
      }).join('');

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

    if (!allowedLocations.length) {
      showToast('Mindestens ein Standort (001 oder 002) muss aktiviert sein.');
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
        accessLevel: accessLevel
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
      const btn = ev.target.closest('button[data-view]');
      if (!btn) return;
      STATE.activeView = btn.dataset.view;
      renderActiveView();
    };
    $('osNavList').addEventListener('click', handleNavClick);
    $('osMobileNav').addEventListener('click', handleNavClick);

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
