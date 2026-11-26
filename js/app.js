'use strict';

(function() {
  const STATE = {
    session: null,
    lastLoginSecret: '',
    activeAuthTab: 'login',
    activeView: 'overview',
    rbacEntries: [],
    pendingRequests: [],
    rbacLocations: [],
    allowedRoles: ['ADMIN', 'FB_MANAGER', 'KUECHENCHEF', 'BARCHEF', 'SERVICELEITUNG', 'SERVICECHEF', 'ADMIN_VIEWER', 'VIEWER'],
    allowedBereiche: ['ALLE', 'FOOD_SUSHI', 'BEVERAGE_DESSERT', 'KUECHE', 'BAR', 'SERVICE'],
    adminNotificationEmail: 'j.helmeke97@gmail.com',
    lastOtpResult: null,
    tabCatalog: { rezeptur: [], einkauf: [], operations: [] },
    openPillars: { WARENWIRTSCHAFT: false, CONTROLLING: false, OPERATIONS: false },
    moduleFrames: {},
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

  function setAuthMessages(errorMsg, successMsg) {
    const errEl = $('lockError');
    const okEl = $('lockSuccess');
    if (errEl) {
      if (errorMsg) {
        errEl.textContent = errorMsg;
        errEl.classList.remove('hidden');
      } else {
        errEl.textContent = '';
        errEl.classList.add('hidden');
      }
    }
    if (okEl) {
      if (successMsg) {
        okEl.textContent = successMsg;
        okEl.classList.remove('hidden');
      } else {
        okEl.textContent = '';
        okEl.classList.add('hidden');
      }
    }
  }

  function switchAuthTab(tab) {
    STATE.activeAuthTab = tab === 'register' ? 'register' : 'login';
    const isReg = STATE.activeAuthTab === 'register';
    const btnLogin = $('tabBtnLogin');
    const btnReg = $('tabBtnRegister');
    const paneLogin = $('loginFormPane');
    const paneReg = $('registerFormPane');
    if (btnLogin) {
      btnLogin.classList.toggle('active', !isReg);
      btnLogin.setAttribute('aria-selected', isReg ? 'false' : 'true');
    }
    if (btnReg) {
      btnReg.classList.toggle('active', isReg);
      btnReg.setAttribute('aria-selected', isReg ? 'true' : 'false');
    }
    if (paneLogin) paneLogin.classList.toggle('hidden', isReg);
    if (paneReg) paneReg.classList.toggle('hidden', !isReg);
    setAuthMessages('', '');
  }

  function clearModuleFrames() {
    STATE.moduleFrames = {};
    const host = $('osModuleFrameHost');
    if (host) {
      host.innerHTML = '';
      host.classList.add('hidden');
    }
    const main = $('osMainContent');
    if (main) main.classList.remove('hidden');
  }

  function clearAllModuleCaches() {
    clearModuleFrames();
    if (window.SonaBestandModule) window.SonaBestandModule.clearCache();
    if (window.SonaControllingModule) window.SonaControllingModule.clearCache();
    if (window.SonaEinkaufModule) window.SonaEinkaufModule.clearCache();
    if (window.SonaRezepturModule) window.SonaRezepturModule.clearCache();
  }

  function lockApp(reasonMsg) {
    window.SonaApi.setToken('');
    STATE.session = null;
    STATE.lastLoginSecret = '';
    STATE.rbacEntries = [];
    STATE.pendingRequests = [];
    STATE.lastOtpResult = null;
    clearAllModuleCaches();
    $('osAppShell').classList.add('hidden');
    $('forcePasswordScreen').classList.add('hidden');
    $('changePasswordModal').classList.add('hidden');
    $('userProfileModal').classList.add('hidden');
    if ($('forgotPasswordModal')) $('forgotPasswordModal').classList.add('hidden');
    $('osNavList').innerHTML = '';
    $('osMobileNav').innerHTML = '';
    $('osMainContent').innerHTML = '';
    if ($('loginPassword')) $('loginPassword').value = '';
    if ($('forcePwCurrent')) $('forcePwCurrent').value = '';
    if ($('forcePwNew')) $('forcePwNew').value = '';
    if ($('forcePwConfirm')) $('forcePwConfirm').value = '';
    $('lockScreen').classList.remove('hidden');
    switchAuthTab('login');
    setAuthMessages(reasonMsg || '', '');
    loadPublicMeta();
  }

  async function loadPublicMeta() {
    const locSel = $('regLocation');
    const renderLocOptions = locs => {
      if (!locSel) return;
      locSel.innerHTML = (locs || window.SONA_OS_DEFAULTS.LOCATIONS).map(l =>
        '<option value="' + esc(l.id) + '">' + esc(l.name) + ' (' + esc(l.id) + ')</option>'
      ).join('');
    };
    renderLocOptions(window.SONA_OS_DEFAULTS.LOCATIONS);
    try {
      const res = await window.SonaApi.listUsers();
      if (res && res.success && Array.isArray(res.locations) && res.locations.length) {
        renderLocOptions(res.locations);
      }
    } catch (err) {
      // Fallback-Standorte bleiben aktiv; Verbindungsfehler werden beim Submit angezeigt
    }
  }

  function showForcePasswordScreen() {
    const s = STATE.session;
    if (!s || !s.user) {
      lockApp();
      return;
    }
    $('lockScreen').classList.add('hidden');
    $('osAppShell').classList.add('hidden');
    const lbl = $('forcePwUserLabel');
    if (lbl) {
      lbl.textContent = s.user.name + (s.user.email ? ' · ' + s.user.email : '');
    }
    if ($('forcePwError')) {
      $('forcePwError').textContent = '';
      $('forcePwError').classList.add('hidden');
    }
    if ($('forcePwCurrent')) $('forcePwCurrent').value = STATE.lastLoginSecret || '';
    if ($('forcePwNew')) $('forcePwNew').value = '';
    if ($('forcePwConfirm')) $('forcePwConfirm').value = '';
    $('forcePasswordScreen').classList.remove('hidden');
  }

  async function submitLogin() {
    const email = ($('loginEmail') && $('loginEmail').value || '').trim().toLowerCase();
    const password = ($('loginPassword') && $('loginPassword').value || '').trim();
    const rememberMe = !!($('loginRememberMe') && $('loginRememberMe').checked);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthMessages('Bitte gültige Gmail / E-Mail-Adresse eingeben.', '');
      return;
    }
    if (!password) {
      setAuthMessages('Bitte Passwort oder Einmal-Passwort eingeben.', '');
      return;
    }

    setAuthMessages('', '');
    window.SonaLoader.show(120);
    try {
      const res = await window.SonaApi.login(email, password, '', rememberMe);
      if (!res || !res.success || !res.token) {
        if ($('loginPassword')) $('loginPassword').value = '';
        setAuthMessages((res && res.error) || 'Anmeldung fehlgeschlagen.', '');
        return;
      }
      window.SonaApi.setToken(res.token, rememberMe);
      STATE.session = res;
      if ($('loginPassword')) $('loginPassword').value = '';
      if (res.mustChangePassword) {
        STATE.lastLoginSecret = password;
        showForcePasswordScreen();
        return;
      }
      STATE.lastLoginSecret = '';
      STATE.activeView = 'overview';
      renderAuthenticatedShell();
    } catch (err) {
      if ($('loginPassword')) $('loginPassword').value = '';
      setAuthMessages('Verbindungsfehler: ' + (err && err.message ? err.message : String(err)), '');
    } finally {
      window.SonaLoader.hide();
    }
  }

  async function submitRegisterRequest() {
    const name = ($('regName') && $('regName').value || '').trim();
    const email = ($('regEmail') && $('regEmail').value || '').trim().toLowerCase();
    const standortId = ($('regLocation') && $('regLocation').value) || '001';
    const bereich = ($('regBereich') && $('regBereich').value) || 'ALLE';
    const note = ($('regNote') && $('regNote').value || '').trim();

    if (name.length < 2) {
      setAuthMessages('Bitte vollständigen Namen eingeben (mind. 2 Zeichen).', '');
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthMessages('Bitte gültige Gmail / E-Mail-Adresse eingeben.', '');
      return;
    }

    setAuthMessages('', '');
    window.SonaLoader.show(0);
    try {
      const res = await window.SonaApi.registerRequest({
        name: name,
        email: email,
        standortId: standortId,
        bereich: bereich,
        note: note
      });
      if (!res || !res.success) {
        setAuthMessages((res && res.error) || 'Anfrage konnte nicht gesendet werden.', '');
        return;
      }
      if ($('regName')) $('regName').value = '';
      if ($('regEmail')) $('regEmail').value = '';
      if ($('regNote')) $('regNote').value = '';
      const extraInfo = res.notifiedAdmin ? ' Die Administration wurde per E-Mail benachrichtigt.' : '';
      setAuthMessages('', (res.message || 'Zugangs-Anfrage gesendet.') + extraInfo);
    } catch (err) {
      setAuthMessages('Verbindungsfehler: ' + (err && err.message ? err.message : String(err)), '');
    } finally {
      window.SonaLoader.hide();
    }
  }

  async function submitForcePasswordChange() {
    const curPw = ($('forcePwCurrent') && $('forcePwCurrent').value || '').trim();
    const newPw = ($('forcePwNew') && $('forcePwNew').value || '').trim();
    const confirmPw = ($('forcePwConfirm') && $('forcePwConfirm').value || '').trim();
    const errEl = $('forcePwError');
    const showForceErr = msg => {
      if (!errEl) return;
      if (msg) {
        errEl.textContent = msg;
        errEl.classList.remove('hidden');
      } else {
        errEl.textContent = '';
        errEl.classList.add('hidden');
      }
    };

    if (!curPw) {
      showForceErr('Bitte aktuelles Passwort / Einmal-Passwort eingeben.');
      return;
    }
    if (newPw.length < 6 || newPw.length > 64) {
      showForceErr('Das neue Passwort muss zwischen 6 und 64 Zeichen lang sein.');
      return;
    }
    if (newPw !== confirmPw) {
      showForceErr('Die beiden neuen Passwörter stimmen nicht überein.');
      return;
    }

    showForceErr('');
    window.SonaLoader.show(0);
    try {
      const res = await window.SonaApi.changePassword(curPw, newPw);
      if (!res || !res.success || !res.token) {
        showForceErr((res && res.error) || 'Passwort konnte nicht gespeichert werden.');
        return;
      }
      window.SonaApi.setToken(res.token, window.SonaApi.isRemembered());
      STATE.session = res;
      STATE.lastLoginSecret = '';
      if ($('forcePwCurrent')) $('forcePwCurrent').value = '';
      if ($('forcePwNew')) $('forcePwNew').value = '';
      if ($('forcePwConfirm')) $('forcePwConfirm').value = '';
      $('forcePasswordScreen').classList.add('hidden');
      STATE.activeView = 'overview';
      renderAuthenticatedShell();
      showToast('Persönliches Passwort gespeichert. Willkommen im SONA OS!');
    } catch (err) {
      showForceErr('Verbindungsfehler: ' + (err && err.message ? err.message : String(err)));
    } finally {
      window.SonaLoader.hide();
    }
  }

  function getIsoWeekNumber(dateObj) {
    const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  function updateGlobalPeriodBar(session) {
    const now = new Date();
    const dateEl = $('osPeriodDate');
    const monthEl = $('osPeriodMonth');
    const kwEl = $('osPeriodKw');
    const locEl = $('osPeriodLocation');
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    if (monthEl) {
      monthEl.textContent = now.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    }
    if (kwEl) {
      kwEl.textContent = 'KW ' + String(getIsoWeekNumber(now)).padStart(2, '0');
    }
    if (locEl && session) {
      locEl.textContent = session.standortName || '';
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
    updateGlobalPeriodBar(s);

    const mods = s.ecosystemModules || [];
    const opsMod = mods.find(m => m.key === 'operations');
    const perms = (s && s.permissions) || {};
    const opTabs = (perms.tabPermissions && perms.tabPermissions.operations !== undefined)
      ? perms.tabPermissions.operations
      : 'ALL';
    const hasOpTab = id => opTabs === 'ALL' || (Array.isArray(opTabs) && opTabs.indexOf(id) !== -1);

    const opsNavItems = [];
    if (opsMod) {
      if (hasOpTab('schwund_eingabe') && opsMod.schwundUrl) {
        opsNavItems.push({ key: 'ops_schwund', title: 'Schwund', pillar: 'OPERATIONS', externalUrl: buildQuickOpsUrl(opsMod.schwundUrl, s) });
      }
      if (hasOpTab('bruch_eingabe') && opsMod.bruchUrl) {
        opsNavItems.push({ key: 'ops_bruch', title: 'Bruch', pillar: 'OPERATIONS', externalUrl: buildQuickOpsUrl(opsMod.bruchUrl, s) });
      }
      if (hasOpTab('reklamation')) {
        opsNavItems.push({ key: 'ops_reklamation', title: 'Reklamation und Beschwerden', pillar: 'OPERATIONS' });
      }
      if (hasOpTab('todo')) {
        opsNavItems.push({ key: 'ops_todo', title: 'To-Do-Liste', pillar: 'OPERATIONS' });
      }
      if (hasOpTab('putzplan')) {
        opsNavItems.push({ key: 'ops_putzplan', title: 'Putzplan', pillar: 'OPERATIONS' });
      }
      if (hasOpTab('mitarbeiterbewertung')) {
        opsNavItems.push({ key: 'ops_ranking', title: 'Mitarbeiter Ranking', pillar: 'OPERATIONS' });
      }
    }

    const navItems = [
      { key: 'overview', title: 'Startseite', pillar: 'ROOT' }
    ]
      .concat(opsNavItems)
      .concat(mods.filter(m => m.key !== 'operations').map(m => ({ key: 'mod_' + m.key, title: m.title, pillar: m.pillar || 'WARENWIRTSCHAFT' })));

    if (s.permissions.adminMatrix) {
      navItems.push({ key: 'rbac', title: 'Rechte-Matrix', pillar: 'ADMIN' });
    }

    const validNonNavView = STATE.activeView === 'mod_operations';
    if (!validNonNavView && !navItems.some(x => x.key === STATE.activeView)) {
      STATE.activeView = 'overview';
    }

    const pillarGroups = [
      { id: 'OPERATIONS', label: 'Operations' },
      { id: 'WARENWIRTSCHAFT', label: 'Warenwirtschaft' },
      { id: 'CONTROLLING', label: 'Controlling' },
      { id: 'PERFORMANCE', label: 'Performance' }
    ];

    let navHtml =
      '<button type="button" class="os-nav-btn' + (STATE.activeView === 'overview' ? ' active' : '') + '" data-view="overview">' +
        '<span>Startseite</span>' +
      '</button>';

    const isOpsView = STATE.activeView === 'mod_operations' || STATE.activeView.indexOf('ops_') === 0;
    navHtml += pillarGroups.map(group => {
      const items = navItems.filter(it => it.pillar === group.id);
      if (!items.length) return '';
      const isOpen = !!STATE.openPillars[group.id] || items.some(it => it.key === STATE.activeView) || (group.id === 'OPERATIONS' && isOpsView);
      STATE.openPillars[group.id] = isOpen;
      return '<div class="os-nav-group' + (isOpen ? ' open' : '') + '" data-pillar="' + esc(group.id) + '">' +
        '<button type="button" class="os-nav-group-btn" data-toggle-pillar="' + esc(group.id) + '">' +
          '<span>' + esc(group.label) + '</span>' +
          '<span class="os-nav-chevron">▸</span>' +
        '</button>' +
        '<div class="os-nav-group-items">' +
          items.map(item =>
            item.externalUrl
              ? '<a class="os-nav-btn" href="' + esc(item.externalUrl) + '" target="_blank" rel="noopener noreferrer" onclick="window.open(this.href, \'_blank\', \'noopener,noreferrer\'); return false;">' +
                  '<span>' + esc(item.title) + '</span>' +
                '</a>'
              : '<button type="button" class="os-nav-btn' + (STATE.activeView === item.key ? ' active' : '') + '" data-view="' + esc(item.key) + '">' +
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
    if (locSelect) {
      locSelect.innerHTML = allowedLocs.map(l =>
        '<option value="' + esc(l.id) + '"' + (l.id === s.standortId ? ' selected' : '') + '>' + esc(shortLocName(l.name)) + '</option>'
      ).join('');
      locSelect.disabled = allowedLocs.length <= 1;
    }

    const brandLocName = $('sidebarBrandLocName');
    const brandLocCaret = $('sidebarBrandLocCaret');
    const locMenu = $('locationSwitcherMenu');
    if (brandLocName) brandLocName.textContent = shortLocName(s.standortName);
    if (brandLocCaret) brandLocCaret.classList.toggle('hidden', allowedLocs.length <= 1);
    if (locMenu) {
      locMenu.classList.add('hidden');
      locMenu.innerHTML = allowedLocs.map(l =>
        '<button type="button" class="loc-switcher-item' + (l.id === s.standortId ? ' active' : '') + '" data-loc-id="' + esc(l.id) + '">' +
          '<span>' + esc(l.name) + '</span>' +
          '<span style="font-size:10px;opacity:0.75;">' + esc(l.id) + '</span>' +
        '</button>'
      ).join('');
    }

    renderActiveView();
  }

  function showMainContentPane() {
    const mainEl = $('osMainContent');
    const hostEl = $('osModuleFrameHost');
    if (hostEl) {
      hostEl.classList.add('hidden');
      Object.keys(STATE.moduleFrames).forEach(k => {
        if (STATE.moduleFrames[k]) STATE.moduleFrames[k].classList.add('hidden');
      });
    }
    if (mainEl) {
      mainEl.classList.remove('hidden');
      mainEl.classList.remove('os-content-fullbleed');
    }
    window.SonaLoader.hide();
  }

  function buildDirectEmbeddedUrl(mod, s) {
    if (!mod || !mod.legacyUrl || mod.key === 'rezeptur') return '';
    const loc = encodeURIComponent(s.standortId || '001');
    const sep = mod.legacyUrl.indexOf('?') === -1 ? '?' : '&';
    let url = mod.legacyUrl + sep + 'standortId=' + loc + '&loc=' + loc + '&embedded=1';
    const tabPerms = s.permissions && s.permissions.tabPermissions;
    if (mod.key === 'einkauf' && tabPerms && Array.isArray(tabPerms.einkauf)) {
      url += '&tabs=' + encodeURIComponent(tabPerms.einkauf.join(','));
    }
    return url;
  }

  function renderActiveView() {
    const s = STATE.session;
    if (!s) return;

    document.querySelectorAll('#osNavList .os-nav-btn, #osMobileNav button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === STATE.activeView);
    });

    if (STATE.activeView === 'overview') {
      showMainContentPane();
      renderOverview();
      return;
    }
    if (STATE.activeView === 'rbac' && s.permissions.adminMatrix) {
      showMainContentPane();
      renderRbacMatrixView();
      return;
    }
    if (STATE.activeView.indexOf('ops_') === 0) {
      const opsMod = (s.ecosystemModules || []).find(m => m.key === 'operations');
      if (opsMod && window.SonaOperationsModule) {
        const grp = document.querySelector('#osNavList .os-nav-group[data-pillar="OPERATIONS"]');
        if (grp) {
          grp.classList.add('open');
          STATE.openPillars.OPERATIONS = true;
        }
        showMainContentPane();
        window.SonaOperationsModule.mount(s, opsMod, STATE.activeView.slice(4));
        return;
      }
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
          showMainContentPane();
          window.SonaOperationsModule.mount(s, mod, 'home');
        } else {
          renderEmbeddedModuleView(mod);
        }
        return;
      }
    }

    STATE.activeView = 'overview';
    showMainContentPane();
    renderOverview();
  }

  async function renderEmbeddedModuleView(mod) {
    const s = STATE.session;
    const container = $('osMainContent');
    const hostEl = $('osModuleFrameHost');
    if (!container || !hostEl || !s) return;

    const frameKey = String(s.standortId || '001') + ':' + String(mod.key);
    const existingFrame = STATE.moduleFrames[frameKey];

    // Keep-Alive Iframe Pool: Bereits geladene Module sofort (0 ms) einblenden
    if (existingFrame && existingFrame.parentNode === hostEl) {
      container.classList.add('hidden');
      hostEl.classList.remove('hidden');
      Object.keys(STATE.moduleFrames).forEach(k => {
        if (STATE.moduleFrames[k]) {
          STATE.moduleFrames[k].classList.toggle('hidden', k !== frameKey);
        }
      });
      return;
    }

    window.SonaLoader.show(250);

    try {
      let launchUrl = buildDirectEmbeddedUrl(mod, s);
      if (!launchUrl) {
        const res = await window.SonaApi.getModuleLaunchUrl(mod.key, s.standortId);
        if (STATE.activeView !== 'mod_' + mod.key) {
          window.SonaLoader.hide();
          return;
        }
        if (!res || !res.success || !res.launchUrl) {
          showMainContentPane();
          container.innerHTML =
            '<div class="card">' +
              '<h3>' + esc(mod.title) + ' konnte nicht gestartet werden</h3>' +
              '<p class="module-desc">' + esc((res && res.error) || 'Zugriff verweigert oder Verbindungsfehler.') + '</p>' +
            '</div>';
          window.SonaLoader.hide();
          return;
        }
        launchUrl = res.launchUrl;
      }

      if (STATE.activeView !== 'mod_' + mod.key) {
        window.SonaLoader.hide();
        return;
      }

      const iframe = document.createElement('iframe');
      iframe.className = 'os-module-frame';
      iframe.title = mod.title;
      iframe.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen');
      iframe.addEventListener('load', () => window.SonaLoader.hide());
      iframe.src = launchUrl;

      STATE.moduleFrames[frameKey] = iframe;
      Object.keys(STATE.moduleFrames).forEach(k => {
        if (STATE.moduleFrames[k]) {
          STATE.moduleFrames[k].classList.toggle('hidden', k !== frameKey);
        }
      });
      hostEl.appendChild(iframe);
      container.classList.add('hidden');
      hostEl.classList.remove('hidden');
      setTimeout(() => window.SonaLoader.hide(), 8000);
    } catch (err) {
      if (STATE.activeView !== 'mod_' + mod.key) {
        window.SonaLoader.hide();
        return;
      }
      showMainContentPane();
      container.innerHTML =
        '<div class="card">' +
          '<h3>Verbindungsfehler</h3>' +
          '<p class="module-desc">' + esc(err && err.message ? err.message : String(err)) + '</p>' +
        '</div>';
      window.SonaLoader.hide();
    }
  }

  function buildQuickOpsUrl(rawUrl, session) {
    if (!rawUrl) return '';
    const userName = (session && session.user && session.user.name) ? String(session.user.name).trim() : '';
    if (!userName) return rawUrl;
    return rawUrl + (rawUrl.indexOf('?') === -1 ? '?' : '&') + 'user=' + encodeURIComponent(userName);
  }

  function renderOverview() {
    const s = STATE.session;
    const mods = s.ecosystemModules || [];
    const container = $('osMainContent');
    const perms = (s && s.permissions) || {};
    const opTabs = (perms.tabPermissions && perms.tabPermissions.operations !== undefined)
      ? perms.tabPermissions.operations
      : 'ALL';
    const opsMod = mods.find(m => m.key === 'operations');
    const schwundUrl = (opsMod && opsMod.schwundUrl) ? buildQuickOpsUrl(opsMod.schwundUrl, s) : '';
    const bruchUrl = (opsMod && opsMod.bruchUrl) ? buildQuickOpsUrl(opsMod.bruchUrl, s) : '';
    const canSchwund = !!(schwundUrl && (opTabs === 'ALL' || (Array.isArray(opTabs) && opTabs.indexOf('schwund_eingabe') !== -1)));
    const canBruch = !!(bruchUrl && (opTabs === 'ALL' || (Array.isArray(opTabs) && opTabs.indexOf('bruch_eingabe') !== -1)));
    const canPutzplan = !!(opsMod && (opTabs === 'ALL' || (Array.isArray(opTabs) && opTabs.indexOf('putzplan') !== -1)));
    const canTodo = !!(opsMod && (opTabs === 'ALL' || (Array.isArray(opTabs) && opTabs.indexOf('todo') !== -1)));

    const renderTile = m =>
      '<button type="button" class="home-tile" onclick="window.SonaApp.openView(\'mod_' + esc(m.key) + '\')">' +
        '<div class="home-tile-head">' +
          '<h4 class="home-tile-title">' + esc(m.title) + '</h4>' +
          '<span class="home-tile-arrow">→</span>' +
        '</div>' +
        '<p class="home-tile-desc">' + esc(m.subtitle) + '</p>' +
      '</button>';

    const pillars = [
      { id: 'OPERATIONS', title: 'Operations' },
      { id: 'WARENWIRTSCHAFT', title: 'Warenwirtschaft' },
      { id: 'CONTROLLING', title: 'Controlling' },
      { id: 'PERFORMANCE', title: 'Performance' }
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

    const quickOpsHtml =
      (canSchwund ? '<button type="button" class="btn btn-sm home-quick-ops-btn" data-quick-url="' + esc(schwundUrl) + '" title="Schwund im neuen Tab erfassen">+ Schwund</button>' : '') +
      (canBruch ? '<button type="button" class="btn btn-sm home-quick-ops-btn" data-quick-url="' + esc(bruchUrl) + '" title="Bruch im neuen Tab erfassen">+ Bruch</button>' : '') +
      (canPutzplan ? '<button type="button" class="btn btn-sm home-quick-view-btn" data-quick-view="ops_putzplan" title="Putzplan öffnen">Putzplan</button>' : '') +
      (canTodo ? '<button type="button" class="btn btn-sm home-quick-view-btn" data-quick-view="ops_todo" title="To-Do-Checkliste öffnen">Checkliste</button>' : '');

    container.innerHTML =
      '<div class="os-home-greeting">' +
        '<h2>Willkommen, ' + esc(s.user.name) + '</h2>' +
        '<div class="home-quick-toolbar">' +
          '<div class="home-search-wrap">' +
            '<input type="search" id="homeQuickSearch" class="input-control home-search-input" placeholder="Schnellsuche …" autocomplete="off">' +
            '<div id="homeSearchResults" class="home-search-results hidden"></div>' +
          '</div>' +
          quickOpsHtml +
        '</div>' +
      '</div>' +
      (pillarsHtml || '<div class="card"><p>Für deinen Benutzer sind aktuell noch keine Bereiche freigegeben.</p></div>');

    container.querySelectorAll('.home-quick-ops-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.quickUrl) {
          window.open(btn.dataset.quickUrl, '_blank', 'noopener,noreferrer');
        }
      });
    });
    container.querySelectorAll('.home-quick-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.quickView) {
          openView(btn.dataset.quickView);
        }
      });
    });

    // Schnellsuche über alle freigegebenen Module, Bereiche & Aktionen
    const searchItems = [];
    mods.forEach(m => {
      searchItems.push({
        label: m.title,
        meta: m.pillarTitle || 'Modul',
        keywords: (m.title + ' ' + (m.subtitle || '') + ' ' + m.key).toLowerCase(),
        run: () => window.SonaApp.openView('mod_' + m.key)
      });
    });
    if (canSchwund) {
      searchItems.push({
        label: '+ Schwund erfassen (Neuer Tab)',
        meta: 'Operations',
        keywords: 'schwund verderb eingabe operations verlust',
        run: () => window.open(schwundUrl, '_blank', 'noopener,noreferrer')
      });
    }
    if (canBruch) {
      searchItems.push({
        label: '+ Bruch erfassen (Neuer Tab)',
        meta: 'Operations',
        keywords: 'bruch glas geschirr eingabe operations',
        run: () => window.open(bruchUrl, '_blank', 'noopener,noreferrer')
      });
    }
    if (perms.adminMatrix) {
      searchItems.push({
        label: 'Rechte-Matrix & Mitarbeiter',
        meta: 'Administration',
        keywords: 'rechte matrix mitarbeiter benutzer admin anfragen gmail passwort',
        run: () => window.SonaApp.openView('rbac')
      });
    }

    const searchInput = $('homeQuickSearch');
    const resultsBox = $('homeSearchResults');
    if (searchInput && resultsBox) {
      let currentMatches = [];
      const renderMatches = q => {
        const clean = String(q || '').trim().toLowerCase();
        if (!clean) {
          currentMatches = [];
          resultsBox.classList.add('hidden');
          resultsBox.innerHTML = '';
          return;
        }
        currentMatches = searchItems.filter(it => it.keywords.indexOf(clean) !== -1 || it.label.toLowerCase().indexOf(clean) !== -1);
        if (!currentMatches.length) {
          resultsBox.innerHTML = '<div style="padding:8px 10px;font-size:12px;color:var(--os-silk);">Keine Treffer für „' + esc(q) + '“</div>';
          resultsBox.classList.remove('hidden');
          return;
        }
        resultsBox.innerHTML = currentMatches.map((it, i) =>
          '<button type="button" class="home-search-item" data-sidx="' + i + '">' +
            '<span>' + esc(it.label) + '</span>' +
            '<small>' + esc(it.meta) + '</small>' +
          '</button>'
        ).join('');
        resultsBox.classList.remove('hidden');
        resultsBox.querySelectorAll('.home-search-item').forEach(btn => {
          btn.addEventListener('click', () => {
            const picked = currentMatches[parseInt(btn.dataset.sidx, 10)];
            resultsBox.classList.add('hidden');
            searchInput.value = '';
            if (picked && picked.run) picked.run();
          });
        });
      };

      searchInput.addEventListener('input', () => renderMatches(searchInput.value));
      searchInput.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' && currentMatches.length) {
          ev.preventDefault();
          const first = currentMatches[0];
          resultsBox.classList.add('hidden');
          searchInput.value = '';
          if (first && first.run) first.run();
        } else if (ev.key === 'Escape') {
          resultsBox.classList.add('hidden');
        }
      });
    }
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

  function renderTabPermissionBox(prefix, modKey, title, catalog, currentVal) {
    const isAll = !Array.isArray(currentVal);
    const list = Array.isArray(currentVal) ? currentVal : catalog.map(t => t.id);
    return '<div class="rbac-tabs-box" data-tabmod="' + esc(modKey) + '">' +
      '<div class="rbac-tabs-box-head">' +
        '<b>' + esc(title) + '</b>' +
        '<label style="font-size:11.5px;color:var(--os-cream);display:inline-flex;align-items:center;gap:6px;cursor:pointer;">' +
          '<input type="checkbox" class="rbac-tab-all" data-idx="' + esc(prefix) + '" data-tabmod="' + esc(modKey) + '"' + (isAll ? ' checked' : '') + '> Gesamtfreigabe (Alle Tabs)' +
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

  function wireTabBoxToggleEvents(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll('.rbac-tab-all').forEach(chk => {
      chk.addEventListener('change', () => {
        const box = chk.closest('.rbac-tabs-box');
        const chips = box && box.querySelector('.rbac-tab-chips');
        if (chips) chips.classList.toggle('disabled', chk.checked);
      });
    });
  }

  function readTabPermissionsFromContainer(containerEl) {
    const tabPermissions = { rezeptur: 'ALL', einkauf: 'ALL', operations: 'ALL' };
    if (!containerEl) return tabPermissions;
    ['rezeptur', 'einkauf', 'operations'].forEach(modKey => {
      const box = containerEl.querySelector('.rbac-tabs-box[data-tabmod="' + modKey + '"]');
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
    return tabPermissions;
  }

  function renderOtpResultBanner() {
    const slot = $('otpResultBanner');
    if (!slot) return;
    const otp = STATE.lastOtpResult;
    if (!otp || !otp.password) {
      slot.innerHTML = '';
      slot.classList.add('hidden');
      return;
    }
    const mailNote = otp.emailSent
      ? 'E-Mail mit Einmal-Passwort wurde erfolgreich an ' + otp.email + ' gesendet.'
      : 'Hinweis: Automatischer E-Mail-Versand nicht möglich' + (otp.emailError ? ' (' + otp.emailError + ')' : '') + ' – bitte Einmal-Passwort manuell weitergeben.';

    slot.classList.remove('hidden');
    slot.innerHTML =
      '<div class="otp-banner">' +
        '<div>' +
          '<div class="kicker" style="color:var(--os-green);">Einmal-Passwort aktiv · ' + esc(otp.displayName) + '</div>' +
          '<div style="margin:6px 0;">Einmal-Passwort: <span class="otp-code-pill">' + esc(otp.password) + '</span></div>' +
          '<div style="font-size:11.5px;color:var(--os-silk);">' + esc(mailNote) + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center;">' +
          '<button type="button" class="btn btn-sm" id="btnCopyOtpBanner">Kopieren</button>' +
          '<button type="button" class="btn btn-sm" id="btnCloseOtpBanner">Schließen</button>' +
        '</div>' +
      '</div>';

    const copyBtn = $('btnCopyOtpBanner');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(otp.password).then(() => showToast('Einmal-Passwort kopiert.')).catch(() => {});
        } else {
          showToast('Einmal-Passwort: ' + otp.password);
        }
      });
    }
    const closeBtn = $('btnCloseOtpBanner');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        STATE.lastOtpResult = null;
        renderOtpResultBanner();
      });
    }
  }

  function renderPendingRequestsSection() {
    const slot = $('pendingRequestsSection');
    if (!slot) return;
    const reqs = STATE.pendingRequests || [];
    if (!reqs.length) {
      slot.innerHTML = '';
      slot.classList.add('hidden');
      return;
    }

    slot.classList.remove('hidden');
    slot.innerHTML =
      '<div class="card" style="margin-bottom:16px;">' +
        '<div class="card-head">' +
          '<div>' +
            '<div class="kicker">Onboarding · Neue Anfragen</div>' +
            '<h3>Offene Zugangs-Anfragen (' + esc(reqs.length) + ')</h3>' +
          '</div>' +
          '<span class="badge badge-warn">Freigabe ausstehend</span>' +
        '</div>' +
        '<div class="pending-list">' +
          reqs.map((r, idx) =>
            '<div class="pending-item">' +
              '<div>' +
                '<div><b>' + esc(r.displayName) + '</b> <span class="rbac-user-email">(' + esc(r.email) + ')</span></div>' +
                '<div style="font-size:11.5px;color:var(--os-silk);margin-top:3px;">' +
                  'Standort-Wunsch: <b>' + esc(r.requestedLocation || '001') + '</b> · Bereich: <b>' + esc(r.bereich || 'ALLE') + '</b>' +
                  (r.note ? ' · Notiz: ' + esc(r.note) : '') +
                '</div>' +
              '</div>' +
              '<div class="rbac-action-btns">' +
                '<button type="button" class="btn btn-primary btn-sm pending-approve-btn" data-idx="' + idx + '">Konfigurieren &amp; Freigeben</button>' +
                '<button type="button" class="btn btn-sm pending-reject-btn" data-idx="' + idx + '">Ablehnen</button>' +
              '</div>' +
            '</div>'
          ).join('') +
        '</div>' +
      '</div>';

    slot.querySelectorAll('.pending-approve-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const entry = STATE.pendingRequests[parseInt(btn.dataset.idx, 10)];
        if (entry) openUserProfileModal('approve', entry);
      });
    });

    slot.querySelectorAll('.pending-reject-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const entry = STATE.pendingRequests[parseInt(btn.dataset.idx, 10)];
        if (entry) rejectPendingUser(entry);
      });
    });
  }

  async function rejectPendingUser(entry) {
    window.SonaLoader.show(600);
    try {
      const res = await window.SonaApi.saveUser({
        userId: entry.userId,
        name: entry.displayName,
        email: entry.email,
        role: entry.role || 'VIEWER',
        bereich: entry.bereich || 'ALLE',
        status: 'REJECTED',
        note: entry.note || '',
        sendInviteEmail: false
      });
      if (!res || !res.success) {
        showToast('Fehler: ' + ((res && res.error) || 'Ablehnung fehlgeschlagen'));
        return;
      }
      showToast('Anfrage von ' + entry.displayName + ' abgelehnt.');
      await loadRbacTable();
    } catch (err) {
      showToast('Fehler: ' + err.message);
    } finally {
      window.SonaLoader.hide();
    }
  }

  async function renderRbacMatrixView() {
    const container = $('osMainContent');
    container.innerHTML =
      '<div id="otpResultBanner" class="hidden"></div>' +
      '<div id="pendingRequestsSection" class="hidden"></div>' +
      '<div class="card">' +
        '<div class="card-head">' +
          '<div>' +
            '<div class="kicker">Administration</div>' +
            '<h3>Mitarbeiter- &amp; Tab-Rechte-Matrix</h3>' +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
            '<span class="badge" title="Benachrichtigungs-Adresse für neue Anfragen">Anfragen → <span id="rbacNotifyEmailLabel">' + esc(STATE.adminNotificationEmail) + '</span></span>' +
            '<button type="button" class="btn btn-primary btn-sm" id="btnNewRbacUser">+ Neuer Mitarbeiter</button>' +
            '<button type="button" class="btn btn-sm" id="btnReloadRbac">Aktualisieren</button>' +
          '</div>' +
        '</div>' +
        '<p class="module-desc" style="margin-bottom:14px;">Steuere pro Mitarbeiter und Gmail-Konto die Hauptmodule (inkl. Operations), Standorte, Zugriffsstufe und über <b>Tabs ▾</b> die feingranularen Tab-Freigaben.</p>' +
        '<div class="table-wrap"><table id="rbacTable"><thead><tr>' +
          '<th>Benutzer</th><th>Rolle</th><th>Einkauf</th><th>Rezepturen</th><th>Controlling</th><th>Bestand</th><th>Operations</th><th>Performance</th><th>Admin</th><th>Standorte</th><th>Stufe</th><th>Tab-Details</th><th>Aktion</th>' +
        '</tr></thead><tbody id="rbacBody"><tr><td colspan="12">Lade Rechte-Matrix …</td></tr></tbody></table></div>' +
      '</div>';

    $('btnNewRbacUser').addEventListener('click', () => openUserProfileModal('create', null));
    $('btnReloadRbac').addEventListener('click', loadRbacTable);
    renderOtpResultBanner();
    await loadRbacTable();
  }

  async function loadRbacTable() {
    const tbody = $('rbacBody');
    if (!tbody) return;
    window.SonaLoader.show(900);
    try {
      const res = await window.SonaApi.getRbacMatrix();
      if (!res || !res.success) {
        tbody.innerHTML = '<tr><td colspan="12">' + esc((res && res.error) || 'Fehler beim Laden.') + '</td></tr>';
        return;
      }
      STATE.pendingRequests = res.pendingRequests || [];
      STATE.rbacEntries = res.entries || [];
      STATE.tabCatalog = res.tabCatalog || { rezeptur: [], einkauf: [], operations: [] };
      STATE.rbacLocations = (Array.isArray(res.locations) && res.locations.length)
        ? res.locations
        : window.SONA_OS_DEFAULTS.LOCATIONS;
      if (Array.isArray(res.allowedRoles) && res.allowedRoles.length) STATE.allowedRoles = res.allowedRoles;
      if (Array.isArray(res.allowedBereiche) && res.allowedBereiche.length) STATE.allowedBereiche = res.allowedBereiche;
      if (res.adminNotificationEmail) {
        STATE.adminNotificationEmail = res.adminNotificationEmail;
        const lbl = $('rbacNotifyEmailLabel');
        if (lbl) lbl.textContent = res.adminNotificationEmail;
      }

      renderOtpResultBanner();
      renderPendingRequestsSection();

      const allLocations = STATE.rbacLocations;
      tbody.innerHTML = STATE.rbacEntries.map((u, idx) => {
        const locs = u.allowedLocations || [];
        const tp = u.tabPermissions || { rezeptur: 'ALL', einkauf: 'ALL', operations: 'ALL' };
        const isPartial = Array.isArray(tp.rezeptur) || Array.isArray(tp.einkauf) || Array.isArray(tp.operations);
        const statusFlag = u.status && u.status !== 'ACTIVE'
          ? ' · ' + esc(u.status)
          : (u.mustChangePassword ? ' · EINMAL-PW AKTIV' : '');

        return '<tr class="rbac-main-row" data-idx="' + idx + '" data-uid="' + esc(u.userId) + '">' +
          '<td>' +
            '<b>' + esc(u.displayName) + '</b>' +
            (u.email ? '<div class="rbac-user-email">' + esc(u.email) + '</div>' : '') +
            '<div style="font-size:10.5px;color:var(--os-silk);">' + esc(u.userId) + statusFlag + '</div>' +
          '</td>' +
          '<td>' + esc(u.role) + '<div style="font-size:10px;color:var(--os-silk);">' + esc(u.bereich || '') + '</div></td>' +
          '<td class="chk-cell"><input type="checkbox" class="rbac-mod" data-mod="einkauf"' + (u.modules.einkauf ? ' checked' : '') + '></td>' +
          '<td class="chk-cell"><input type="checkbox" class="rbac-mod" data-mod="rezeptur"' + (u.modules.rezeptur ? ' checked' : '') + '></td>' +
          '<td class="chk-cell"><input type="checkbox" class="rbac-mod" data-mod="controlling"' + (u.modules.controlling ? ' checked' : '') + '></td>' +
          '<td class="chk-cell"><input type="checkbox" class="rbac-mod" data-mod="bestand"' + (u.modules.bestand ? ' checked' : '') + '></td>' +
          '<td class="chk-cell"><input type="checkbox" class="rbac-mod" data-mod="operations"' + (u.modules.operations !== false ? ' checked' : '') + '></td>' +
          '<td class="chk-cell"><input type="checkbox" class="rbac-mod" data-mod="performance"' + (u.modules.performance ? ' checked' : '') + '></td>' +
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
          '<td><div class="rbac-action-btns">' +
            '<button type="button" class="btn btn-sm rbac-edit-user-btn" data-idx="' + idx + '">Profil</button>' +
            '<button type="button" class="btn btn-primary btn-sm rbac-save-btn">Speichern</button>' +
            ((STATE.session && STATE.session.user && u.userId !== STATE.session.user.id)
              ? '<button type="button" class="btn btn-sm rbac-delete-user-btn" data-idx="' + idx + '" style="color:#f87171;border-color:rgba(248,113,113,0.35);">Löschen</button>'
              : '') +
          '</div></td>' +
        '</tr>' +
        '<tr class="rbac-tabs-row hidden" data-tabs-for="' + idx + '">' +
          '<td colspan="13">' +
            '<div class="rbac-tabs-grid">' +
              renderTabPermissionBox(idx, 'rezeptur', 'Rezepturen – Tab-Freigaben', STATE.tabCatalog.rezeptur || [], tp.rezeptur) +
              renderTabPermissionBox(idx, 'einkauf', 'Einkauf – Tab-Freigaben', STATE.tabCatalog.einkauf || [], tp.einkauf) +
              renderTabPermissionBox(idx, 'operations', 'Operations – Tab-Freigaben', STATE.tabCatalog.operations || [], tp.operations) +
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

      wireTabBoxToggleEvents(tbody);

      tbody.querySelectorAll('.rbac-edit-user-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const entry = STATE.rbacEntries[parseInt(btn.dataset.idx, 10)];
          if (entry) openUserProfileModal('edit', entry);
        });
      });

      tbody.querySelectorAll('.rbac-save-btn').forEach(btn => {
        btn.addEventListener('click', () => saveRbacRow(btn.closest('tr')));
      });

      tbody.querySelectorAll('.rbac-delete-user-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const entry = STATE.rbacEntries[parseInt(btn.dataset.idx, 10)];
          if (!entry) return;
          if (!window.confirm('Profil „' + (entry.displayName || entry.email || entry.userId) + '“ wirklich dauerhaft löschen?')) {
            return;
          }
          btn.disabled = true;
          btn.textContent = 'Löscht…';
          try {
            const delRes = await window.SonaApi.deleteUser(entry.userId);
            if (!delRes || !delRes.success) {
              showToast((delRes && delRes.error) || 'Löschen fehlgeschlagen.');
              return;
            }
            showToast('Profil ' + (entry.displayName || entry.userId) + ' gelöscht.');
            await loadRbacTable();
          } catch (eDel) {
            showToast('Verbindungsfehler: ' + (eDel && eDel.message ? eDel.message : String(eDel)));
          } finally {
            btn.disabled = false;
            btn.textContent = 'Löschen';
          }
        });
      });
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="12">Fehler: ' + esc(err.message) + '</td></tr>';
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
    const detailRow = document.querySelector('#rbacBody tr.rbac-tabs-row[data-tabs-for="' + idx + '"]');
    const tabPermissions = readTabPermissionsFromContainer(detailRow);

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
        email: orig.email || '',
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
          if (refreshed.mustChangePassword) {
            showForcePasswordScreen();
            return;
          }
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

  function openUserProfileModal(mode, entry) {
    const modal = $('userProfileModal');
    if (!modal) return;

    const errEl = $('userModalError');
    if (errEl) {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    }

    $('userModalMode').value = mode || 'create';
    $('userModalId').value = (entry && entry.userId) || '';

    const roleSel = $('userModalRole');
    const bereichSel = $('userModalBereich');
    roleSel.innerHTML = STATE.allowedRoles.map(r => '<option value="' + esc(r) + '">' + esc(r) + '</option>').join('');
    bereichSel.innerHTML = STATE.allowedBereiche.map(b => '<option value="' + esc(b) + '">' + esc(b) + '</option>').join('');

    const statusSel = $('userModalStatus');
    const genOtpChk = $('userModalGenOtp');
    const genOtpLbl = $('userModalGenOtpLabel');
    const customOtpInput = $('userModalCustomOtp');
    const sendMailChk = $('userModalSendMail');
    const permsWrap = $('userModalPermsWrap');

    customOtpInput.value = '';
    sendMailChk.checked = true;

    if (mode === 'approve' && entry) {
      $('userModalTitle').textContent = 'Zugang konfigurieren & freigeben';
      $('userModalName').value = entry.displayName || '';
      $('userModalEmail').value = entry.email || '';
      roleSel.value = entry.role || 'VIEWER';
      bereichSel.value = entry.bereich || 'ALLE';
      statusSel.value = 'ACTIVE';
      $('userModalDesc').value = entry.note || '';
      genOtpChk.checked = true;
      genOtpChk.disabled = true;
      genOtpLbl.textContent = 'Einmal-Passwort automatisch generieren (bei Freigabe aktiv)';
      permsWrap.classList.remove('hidden');
      const reqLocNorm = String(entry.requestedLocation || '001').trim().padStart(3, '0');
      populateModalPermissions(
        { einkauf: false, rezeptur: true, controlling: false, bestand: false, operations: true, adminMatrix: false },
        [reqLocNorm === '000' ? '001' : reqLocNorm],
        'READ'
      );
    } else if (mode === 'edit' && entry) {
      $('userModalTitle').textContent = 'Profil bearbeiten: ' + (entry.displayName || entry.userId);
      $('userModalName').value = entry.displayName || '';
      $('userModalEmail').value = entry.email || '';
      roleSel.value = entry.role || 'VIEWER';
      bereichSel.value = entry.bereich || 'ALLE';
      statusSel.value = entry.status === 'ACTIVE' ? 'ACTIVE' : 'DISABLED';
      $('userModalDesc').value = entry.note || '';
      genOtpChk.checked = false;
      genOtpChk.disabled = false;
      genOtpLbl.textContent = 'Neues Einmal-Passwort generieren (erzwingt Passwort-Änderung)';
      permsWrap.classList.add('hidden');
    } else {
      $('userModalTitle').textContent = 'Neuer Mitarbeiter';
      $('userModalName').value = '';
      $('userModalEmail').value = '';
      roleSel.value = 'VIEWER';
      bereichSel.value = 'ALLE';
      statusSel.value = 'ACTIVE';
      $('userModalDesc').value = '';
      genOtpChk.checked = true;
      genOtpChk.disabled = true;
      genOtpLbl.textContent = 'Einmal-Passwort automatisch generieren (bei Neuanlage aktiv)';
      permsWrap.classList.remove('hidden');
      populateModalPermissions(
        { einkauf: false, rezeptur: true, controlling: false, bestand: false, operations: true, adminMatrix: false },
        ['001'],
        'READ'
      );
    }

    modal.classList.remove('hidden');
  }

  function populateModalPermissions(mods, defaultLocs, defaultLevel) {
    const wrap = $('userModalPermsWrap');
    if (!wrap) return;
    wrap.querySelectorAll('.user-init-mod').forEach(chk => {
      chk.checked = !!mods[chk.dataset.mod];
    });
    const locsBox = $('userModalInitLocs');
    const allLocations = STATE.rbacLocations.length ? STATE.rbacLocations : window.SONA_OS_DEFAULTS.LOCATIONS;
    const normLocs = (Array.isArray(defaultLocs) ? defaultLocs : ['001'])
      .map(v => String(v || '').trim().padStart(3, '0'))
      .filter(v => v && v !== '000');
    const effectiveLocs = normLocs.length ? normLocs : ['001'];
    locsBox.innerHTML = allLocations.map(l =>
      '<label class="rbac-tab-chip"><input type="checkbox" class="user-init-loc" value="' + esc(l.id) + '"' + (effectiveLocs.indexOf(String(l.id)) !== -1 ? ' checked' : '') + '><span>' + esc(l.name) + ' (' + esc(l.id) + ')</span></label>'
    ).join('');
    $('userModalInitLevel').value = defaultLevel || 'READ';

    const tabsBox = $('userModalInitTabs');
    tabsBox.innerHTML =
      renderTabPermissionBox('init', 'rezeptur', 'Rezepturen – Tab-Freigaben', STATE.tabCatalog.rezeptur || [], 'ALL') +
      renderTabPermissionBox('init', 'einkauf', 'Einkauf – Tab-Freigaben', STATE.tabCatalog.einkauf || [], 'ALL') +
      renderTabPermissionBox('init', 'operations', 'Operations – Tab-Freigaben', STATE.tabCatalog.operations || [], 'ALL');
    wireTabBoxToggleEvents(tabsBox);
  }

  async function submitUserProfileModal() {
    const errEl = $('userModalError');
    const showModalErr = msg => {
      if (!errEl) return;
      if (msg) {
        errEl.textContent = msg;
        errEl.classList.remove('hidden');
        try { errEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (eScroll) {}
        showToast(msg);
      } else {
        errEl.textContent = '';
        errEl.classList.add('hidden');
      }
    };

    const mode = $('userModalMode').value;
    const userId = $('userModalId').value.trim();
    const name = $('userModalName').value.trim();
    const email = $('userModalEmail').value.trim().toLowerCase();
    const role = $('userModalRole').value;
    const bereich = $('userModalBereich').value;
    const status = $('userModalStatus').value;
    const note = $('userModalDesc').value.trim();
    const customOtp = $('userModalCustomOtp').value.trim();
    const genOtp = $('userModalGenOtp').checked;
    const sendMail = $('userModalSendMail').checked;

    if (name.length < 2) {
      showModalErr('Bitte gültigen Namen eingeben (mind. 2 Zeichen).');
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showModalErr('Bitte gültige Gmail / E-Mail-Adresse eingeben.');
      return;
    }
    if (customOtp && (customOtp.length < 6 || customOtp.length > 64)) {
      showModalErr('Ein vorgegebenes Einmal-Passwort muss zwischen 6 und 64 Zeichen lang sein.');
      return;
    }

    const payload = {
      userId: userId,
      name: name,
      email: email,
      role: role,
      bereich: bereich,
      status: status,
      note: note,
      generateOneTimePassword: genOtp,
      oneTimePassword: customOtp,
      sendInviteEmail: sendMail
    };

    if (mode === 'create' || mode === 'approve') {
      const modules = {};
      let adminMatrix = false;
      $('userModalPermsWrap').querySelectorAll('.user-init-mod').forEach(chk => {
        if (chk.dataset.mod === 'adminMatrix') adminMatrix = chk.checked;
        else modules[chk.dataset.mod] = chk.checked;
      });
      const allowedLocations = [];
      $('userModalInitLocs').querySelectorAll('.user-init-loc:checked').forEach(chk => allowedLocations.push(chk.value));
      if (!allowedLocations.length) {
        showModalErr('Mindestens ein Standort muss freigegeben sein.');
        return;
      }
      payload.rule = {
        modules: modules,
        adminMatrix: adminMatrix,
        allowedLocations: allowedLocations,
        accessLevel: $('userModalInitLevel').value,
        tabPermissions: readTabPermissionsFromContainer($('userModalInitTabs'))
      };
    }

    showModalErr('');
    const saveBtn = $('btnSaveUserModal');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Speichert…';
    try {
      const res = await window.SonaApi.saveUser(payload);
      if (!res || !res.success) {
        showModalErr((res && res.error) || 'Speichern fehlgeschlagen.');
        return;
      }
      $('userProfileModal').classList.add('hidden');
      if (res.oneTimePassword) {
        STATE.lastOtpResult = {
          displayName: res.user.displayName,
          email: res.user.email,
          password: res.oneTimePassword,
          emailSent: res.emailSent,
          emailError: res.emailError
        };
      }
      if (res.oneTimePassword && !res.emailSent) {
        showToast('Mitarbeiter gespeichert – E-Mail-Versand fehlgeschlagen (' + (res.emailError || 'siehe Banner') + ').');
      } else {
        showToast('Mitarbeiter ' + res.user.displayName + ' gespeichert.');
      }
      if (STATE.session && STATE.session.user && res.userId === STATE.session.user.id) {
        const refreshed = await window.SonaApi.checkSession();
        if (refreshed && refreshed.success) {
          STATE.session = Object.assign({}, STATE.session, refreshed);
          if (refreshed.mustChangePassword) {
            showForcePasswordScreen();
            return;
          }
          renderAuthenticatedShell();
          return;
        }
      }
      await loadRbacTable();
    } catch (err) {
      showModalErr('Verbindungsfehler: ' + err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Speichern';
    }
  }

  function openChangePwModal() {
    const modal = $('changePasswordModal');
    if (!modal) return;
    if ($('changePwError')) {
      $('changePwError').textContent = '';
      $('changePwError').classList.add('hidden');
    }
    if ($('changePwCurrent')) $('changePwCurrent').value = '';
    if ($('changePwNew')) $('changePwNew').value = '';
    if ($('changePwConfirm')) $('changePwConfirm').value = '';
    modal.classList.remove('hidden');
  }

  async function submitChangePwModal() {
    const curPw = ($('changePwCurrent') && $('changePwCurrent').value || '').trim();
    const newPw = ($('changePwNew') && $('changePwNew').value || '').trim();
    const confirmPw = ($('changePwConfirm') && $('changePwConfirm').value || '').trim();
    const errEl = $('changePwError');
    const showErr = msg => {
      if (!errEl) return;
      if (msg) {
        errEl.textContent = msg;
        errEl.classList.remove('hidden');
      } else {
        errEl.textContent = '';
        errEl.classList.add('hidden');
      }
    };

    if (!curPw) {
      showErr('Bitte aktuelles Passwort eingeben.');
      return;
    }
    if (newPw.length < 6 || newPw.length > 64) {
      showErr('Das neue Passwort muss zwischen 6 und 64 Zeichen lang sein.');
      return;
    }
    if (newPw !== confirmPw) {
      showErr('Die beiden neuen Passwörter stimmen nicht überein.');
      return;
    }

    showErr('');
    const saveBtn = $('btnSaveChangePwModal');
    saveBtn.disabled = true;
    try {
      const res = await window.SonaApi.changePassword(curPw, newPw);
      if (!res || !res.success || !res.token) {
        showErr((res && res.error) || 'Passwort konnte nicht geändert werden.');
        return;
      }
      window.SonaApi.setToken(res.token, window.SonaApi.isRemembered());
      STATE.session = res;
      $('changePasswordModal').classList.add('hidden');
      showToast('Passwort erfolgreich geändert.');
    } catch (err) {
      showErr('Verbindungsfehler: ' + err.message);
    } finally {
      saveBtn.disabled = false;
    }
  }

  function setForgotMessages(errMsg, okMsg) {
    const errEl = $('forgotPwError');
    const okEl = $('forgotPwSuccess');
    if (errEl) {
      if (errMsg) {
        errEl.textContent = errMsg;
        errEl.classList.remove('hidden');
      } else {
        errEl.textContent = '';
        errEl.classList.add('hidden');
      }
    }
    if (okEl) {
      if (okMsg) {
        okEl.textContent = okMsg;
        okEl.classList.remove('hidden');
      } else {
        okEl.textContent = '';
        okEl.classList.add('hidden');
      }
    }
  }

  function openForgotPwModal() {
    const modal = $('forgotPasswordModal');
    if (!modal) return;
    setForgotMessages('', '');
    const loginEmail = ($('loginEmail') && $('loginEmail').value || '').trim();
    if ($('forgotEmail')) $('forgotEmail').value = loginEmail;
    if ($('forgotCode')) $('forgotCode').value = '';
    if ($('forgotNewPw')) $('forgotNewPw').value = '';
    if ($('forgotConfirmPw')) $('forgotConfirmPw').value = '';
    $('forgotStep1Pane').classList.remove('hidden');
    $('forgotStep2Pane').classList.add('hidden');
    modal.classList.remove('hidden');
  }

  async function submitForgotStep1() {
    const email = ($('forgotEmail') && $('forgotEmail').value || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setForgotMessages('Bitte gültige Gmail / E-Mail-Adresse eingeben.', '');
      return;
    }
    setForgotMessages('', '');
    const btn = $('btnRequestResetCode');
    btn.disabled = true;
    try {
      const res = await window.SonaApi.requestPasswordReset(email);
      if (!res || !res.success) {
        setForgotMessages((res && res.error) || 'Code konnte nicht angefordert werden.', '');
        return;
      }
      setForgotMessages('', res.message || 'Bestätigungscode wurde per E-Mail gesendet.');
      $('forgotStep1Pane').classList.add('hidden');
      $('forgotStep2Pane').classList.remove('hidden');
    } catch (err) {
      setForgotMessages('Verbindungsfehler: ' + err.message, '');
    } finally {
      btn.disabled = false;
    }
  }

  async function submitForgotStep2() {
    const email = ($('forgotEmail') && $('forgotEmail').value || '').trim().toLowerCase();
    const code = ($('forgotCode') && $('forgotCode').value || '').trim();
    const newPw = ($('forgotNewPw') && $('forgotNewPw').value || '').trim();
    const confirmPw = ($('forgotConfirmPw') && $('forgotConfirmPw').value || '').trim();

    if (!/^\d{6}$/.test(code)) {
      setForgotMessages('Bitte den 6-stelligen Code aus deiner E-Mail eingeben.', '');
      return;
    }
    if (newPw.length < 6 || newPw.length > 64) {
      setForgotMessages('Das neue Passwort muss zwischen 6 und 64 Zeichen lang sein.', '');
      return;
    }
    if (newPw !== confirmPw) {
      setForgotMessages('Die beiden neuen Passwörter stimmen nicht überein.', '');
      return;
    }

    setForgotMessages('', '');
    const btn = $('btnConfirmResetPw');
    btn.disabled = true;
    try {
      const res = await window.SonaApi.confirmPasswordReset(email, code, newPw);
      if (!res || !res.success) {
        setForgotMessages((res && res.error) || 'Zurücksetzen fehlgeschlagen.', '');
        return;
      }
      $('forgotPasswordModal').classList.add('hidden');
      if ($('loginEmail')) $('loginEmail').value = email;
      if ($('loginPassword')) $('loginPassword').value = '';
      switchAuthTab('login');
      setAuthMessages('', res.message || 'Passwort gespeichert. Bitte jetzt anmelden.');
    } catch (err) {
      setForgotMessages('Verbindungsfehler: ' + err.message, '');
    } finally {
      btn.disabled = false;
    }
  }

  function bindGlobalUiEvents() {
    $('tabBtnLogin').addEventListener('click', () => switchAuthTab('login'));
    $('tabBtnRegister').addEventListener('click', () => switchAuthTab('register'));
    $('btnLoginSubmit').addEventListener('click', submitLogin);
    $('btnRegisterSubmit').addEventListener('click', submitRegisterRequest);
    $('btnForcePwSubmit').addEventListener('click', submitForcePasswordChange);
    $('btnForcePwCancel').addEventListener('click', () => lockApp('Abgemeldet.'));

    ['loginEmail', 'loginPassword'].forEach(id => {
      const el = $(id);
      if (el) {
        el.addEventListener('keydown', ev => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            submitLogin();
          }
        });
      }
    });

    ['regName', 'regEmail', 'regNote'].forEach(id => {
      const el = $(id);
      if (el) {
        el.addEventListener('keydown', ev => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            submitRegisterRequest();
          }
        });
      }
    });

    ['forcePwCurrent', 'forcePwNew', 'forcePwConfirm'].forEach(id => {
      const el = $(id);
      if (el) {
        el.addEventListener('keydown', ev => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            submitForcePasswordChange();
          }
        });
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
      if (btn.dataset.view !== 'rbac') STATE.lastOtpResult = null;
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
    async function switchToLocation(targetLoc) {
      if (!targetLoc || (STATE.session && targetLoc === STATE.session.standortId)) {
        if ($('locationSwitcherMenu')) $('locationSwitcherMenu').classList.add('hidden');
        return;
      }
      window.SonaLoader.show(350);
      try {
        const res = await window.SonaApi.switchLocation(targetLoc);
        if (!res || !res.success || !res.token) {
          showToast('Standortwechsel blockiert: ' + ((res && res.error) || ''));
          renderAuthenticatedShell();
          return;
        }
        window.SonaApi.setToken(res.token, window.SonaApi.isRemembered());
        STATE.session = res;
        clearAllModuleCaches();
        renderAuthenticatedShell();
        showToast('Standort aktiv: ' + res.standortName);
      } catch (err) {
        showToast('Fehler beim Standortwechsel: ' + err.message);
      } finally {
        window.SonaLoader.hide();
      }
    }

    const btnBrandLoc = $('btnBrandLocation');
    const locMenu = $('locationSwitcherMenu');
    if (btnBrandLoc) {
      btnBrandLoc.addEventListener('click', ev => {
        ev.stopPropagation();
        const locs = (STATE.session && STATE.session.locations) || [];
        if (locs.length > 1 && locMenu) {
          locMenu.classList.toggle('hidden');
        } else {
          STATE.lastOtpResult = null;
          STATE.activeView = 'overview';
          renderActiveView();
        }
      });
    }
    if (locMenu) {
      locMenu.addEventListener('click', ev => {
        const item = ev.target.closest('button[data-loc-id]');
        if (!item) return;
        locMenu.classList.add('hidden');
        switchToLocation(item.dataset.locId);
      });
    }
    document.addEventListener('click', ev => {
      if (locMenu && !locMenu.classList.contains('hidden')) {
        if (!ev.target.closest('.sidebar-brand-switcher')) {
          locMenu.classList.add('hidden');
        }
      }
      const srBox = $('homeSearchResults');
      if (srBox && !srBox.classList.contains('hidden')) {
        if (!ev.target.closest('.home-search-wrap')) {
          srBox.classList.add('hidden');
        }
      }
    });

    if ($('globalLocationSelect')) {
      $('globalLocationSelect').addEventListener('change', ev => switchToLocation(ev.target.value));
    }

    if ($('btnOpenForgotPw')) $('btnOpenForgotPw').addEventListener('click', openForgotPwModal);
    if ($('btnCloseForgotModal')) $('btnCloseForgotModal').addEventListener('click', () => $('forgotPasswordModal').classList.add('hidden'));
    if ($('btnRequestResetCode')) $('btnRequestResetCode').addEventListener('click', submitForgotStep1);
    if ($('btnConfirmResetPw')) $('btnConfirmResetPw').addEventListener('click', submitForgotStep2);
    if ($('btnBackForgotStep1')) {
      $('btnBackForgotStep1').addEventListener('click', () => {
        setForgotMessages('', '');
        $('forgotStep2Pane').classList.add('hidden');
        $('forgotStep1Pane').classList.remove('hidden');
      });
    }

    $('btnOpenChangePw').addEventListener('click', openChangePwModal);
    $('btnCloseChangePwModal').addEventListener('click', () => $('changePasswordModal').classList.add('hidden'));
    $('btnCancelChangePwModal').addEventListener('click', () => $('changePasswordModal').classList.add('hidden'));
    $('btnSaveChangePwModal').addEventListener('click', submitChangePwModal);

    $('btnCloseUserModal').addEventListener('click', () => $('userProfileModal').classList.add('hidden'));
    $('btnCancelUserModal').addEventListener('click', () => $('userProfileModal').classList.add('hidden'));
    $('btnSaveUserModal').addEventListener('click', submitUserProfileModal);

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
        loadPublicMeta();
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
    bindGlobalUiEvents();

    window.SonaApi.setUnauthorizedHandler(msg => {
      lockApp(msg || 'Sitzung abgelaufen – bitte erneut anmelden.');
    });
    window.addEventListener('offline', () => showToast('Offline – Verbindung zum SONA Gateway unterbrochen.'));
    window.addEventListener('online', () => showToast('Verbindung wiederhergestellt.'));

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    const existingToken = window.SonaApi.getToken();
    if (!existingToken) {
      window.SonaLoader.hide();
      loadPublicMeta();
      return;
    }

    window.SonaLoader.show(200);
    try {
      const sess = await window.SonaApi.checkSession();
      if (sess && sess.success) {
        STATE.session = sess;
        if (sess.mustChangePassword) {
          showForcePasswordScreen();
          return;
        }
        renderAuthenticatedShell();
        return;
      }
      loadPublicMeta();
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
