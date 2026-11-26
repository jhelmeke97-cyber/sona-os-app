'use strict';

(function() {
  let unauthorizedHandler = null;

  function setUnauthorizedHandler(fn) {
    unauthorizedHandler = typeof fn === 'function' ? fn : null;
  }

  function getGatewayUrl() {
    try {
      const saved = localStorage.getItem(window.SONA_OS_DEFAULTS.GATEWAY_STORAGE_KEY);
      if (saved && saved.indexOf('https://script.google.com/macros/s/') === 0) {
        return saved.trim();
      }
    } catch (e) {}
    return window.SONA_OS_DEFAULTS.DEFAULT_GATEWAY_URL;
  }

  function setGatewayUrl(url) {
    const clean = String(url || '').trim();
    if (!clean) {
      localStorage.removeItem(window.SONA_OS_DEFAULTS.GATEWAY_STORAGE_KEY);
      return window.SONA_OS_DEFAULTS.DEFAULT_GATEWAY_URL;
    }
    if (clean.indexOf('https://script.google.com/macros/s/') !== 0) {
      throw new Error('Ungültige Google Apps Script Web-App URL.');
    }
    localStorage.setItem(window.SONA_OS_DEFAULTS.GATEWAY_STORAGE_KEY, clean);
    return clean;
  }

  function getToken() {
    try {
      return sessionStorage.getItem(window.SONA_OS_DEFAULTS.TOKEN_STORAGE_KEY) ||
        localStorage.getItem(window.SONA_OS_DEFAULTS.TOKEN_STORAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function isRemembered() {
    try {
      return !!localStorage.getItem(window.SONA_OS_DEFAULTS.TOKEN_STORAGE_KEY);
    } catch (e) {
      return false;
    }
  }

  function setToken(token, rememberMe) {
    try {
      const key = window.SONA_OS_DEFAULTS.TOKEN_STORAGE_KEY;
      if (!token) {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
        return;
      }
      if (rememberMe) {
        localStorage.setItem(key, token);
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, token);
        localStorage.removeItem(key);
      }
    } catch (e) {}
  }

  async function callPost(action, body) {
    const url = getGatewayUrl();
    const payload = Object.assign({}, body || {}, { action: action });
    const token = getToken();
    if (token && !payload.token) {
      payload.token = token;
    }

    const res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error('Gateway HTTP ' + res.status);
    }

    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error('Gateway lieferte kein gültiges JSON (evtl. Google-Anmeldung oder fehlendes @sync-Deployment erforderlich).');
    }
    if (
      parsed &&
      parsed.success === false &&
      (parsed.code === 'UNAUTHORIZED' || parsed.code === 'SESSION_EXPIRED') &&
      action !== 'os_login' &&
      action !== 'os_session_check' &&
      unauthorizedHandler
    ) {
      try { unauthorizedHandler(parsed.error || 'Sitzung abgelaufen.'); } catch (eUnauth) {}
    }
    return parsed;
  }

  window.SonaApi = {
    setUnauthorizedHandler: setUnauthorizedHandler,
    getGatewayUrl: getGatewayUrl,
    setGatewayUrl: setGatewayUrl,
    getToken: getToken,
    isRemembered: isRemembered,
    setToken: setToken,
    callPost: callPost,
    ping: () => callPost('os_ping', {}),
    listUsers: () => callPost('os_users', {}),
    login: (email, password, standortId, rememberMe) => callPost('os_login', {
      email: email,
      password: password,
      standortId: standortId || '',
      rememberMe: !!rememberMe
    }),
    registerRequest: (payload) => callPost('os_register_request', payload || {}),
    changePassword: (currentPassword, newPassword) => callPost('os_change_password', {
      currentPassword: currentPassword,
      newPassword: newPassword
    }),
    requestPasswordReset: (email) => callPost('os_password_reset_request', { email: email }),
    confirmPasswordReset: (email, code, newPassword) => callPost('os_password_reset_confirm', {
      email: email,
      code: code,
      newPassword: newPassword
    }),
    checkSession: () => callPost('os_session_check', {}),
    switchLocation: (standortId) => callPost('os_switch_location', { standortId: standortId }),
    getRbacMatrix: () => callPost('os_rbac_list', {}),
    saveRbacRule: (rule) => callPost('os_rbac_save', { rule: rule }),
    saveUser: (user) => callPost('os_user_save', { user: user }),
    deleteUser: (userId) => callPost('os_user_delete', { userId: userId }),
    getBestandDashboard: (standortId, filter, forceRefresh) => callPost('os_bestand_dashboard', {
      standortId: standortId,
      filter: filter || {},
      forceRefresh: !!forceRefresh
    }),
    getBestandMasterDetail: (standortId, masterIngredientId, periodIds) => callPost('os_bestand_detail', {
      standortId: standortId,
      masterIngredientId: masterIngredientId,
      periodIds: periodIds || []
    }),
    runBestandSync: (standortId, mode) => callPost('os_bestand_sync', {
      standortId: standortId,
      mode: mode || 'INKREMENTELL'
    }),
    saveBestandClarification: (standortId, payload) => callPost('os_bestand_clarify', {
      standortId: standortId,
      payload: payload || {}
    }),
    exportBestandCsv: (standortId, exportType, filter) => callPost('os_bestand_export', {
      standortId: standortId,
      exportType: exportType || 'MATRIX',
      filter: filter || {}
    }),
    getControllingMeta: (standortId, forceRefresh) => callPost('os_controlling_meta', {
      standortId: standortId,
      forceRefresh: !!forceRefresh
    }),
    getControllingAnalyse: (standortId, filter, forceRefresh) => callPost('os_controlling_analyse', {
      standortId: standortId,
      filter: filter || {},
      forceRefresh: !!forceRefresh
    }),
    refreshControlling: (standortId) => callPost('os_controlling_refresh', {
      standortId: standortId
    }),
    getControllingPrognoseMeta: (standortId) => callPost('os_controlling_prognose_meta', {
      standortId: standortId
    }),
    calcControllingPrognose: (standortId, anfrage) => callPost('os_controlling_prognose_calc', {
      standortId: standortId,
      anfrage: anfrage || {}
    }),
    getEinkaufOverview: (standortId, forceRefresh) => callPost('os_einkauf_overview', {
      standortId: standortId,
      forceRefresh: !!forceRefresh
    }),
    markEinkaufArticleReviewed: (standortId, artId) => callPost('os_einkauf_mark_reviewed', {
      standortId: standortId,
      artId: artId
    }),
    confirmEinkaufNewArticle: (standortId, artId) => callPost('os_einkauf_confirm_article', {
      standortId: standortId,
      artId: artId
    }),
    confirmAllEinkaufNewArticles: (standortId) => callPost('os_einkauf_confirm_all', {
      standortId: standortId
    }),
    getRezepturOverview: (standortId, forceRefresh) => callPost('os_rezeptur_overview', {
      standortId: standortId,
      forceRefresh: !!forceRefresh
    }),
    getRezepturDetail: (standortId, rezepturId) => callPost('os_rezeptur_detail', {
      standortId: standortId,
      rezepturId: rezepturId
    }),
    syncRezepturMasters: (standortId) => callPost('os_rezeptur_sync_masters', {
      standortId: standortId
    }),
    getOpsReklamationMeta: (standortId, monthName) => callPost('os_ops_reklamation_meta', {
      standortId: standortId,
      monthName: monthName || ''
    }),
    saveOpsReklamation: (standortId, entry) => callPost('os_ops_reklamation_save', {
      standortId: standortId,
      entry: entry || {}
    }),
    getOpsMonthlySummary: (standortId, forceRefresh, periodKey) => callPost('os_ops_monthly_summary', {
      standortId: standortId,
      forceRefresh: !!forceRefresh,
      periodKey: periodKey || ''
    }),
    getOpsRatingMeta: (standortId) => callPost('os_ops_rating_meta', {
      standortId: standortId
    }),
    saveOpsRating: (standortId, entry) => callPost('os_ops_rating_save', {
      standortId: standortId,
      entry: entry || {}
    }),
    saveOpsRatingBatch: (standortId, entries) => callPost('os_ops_rating_save_batch', {
      standortId: standortId,
      entries: Array.isArray(entries) ? entries : []
    }),
    addOpsRatingMember: (standortId, member) => callPost('os_ops_rating_add', {
      standortId: standortId,
      member: member || {}
    }),
    getOpsTodoDay: (standortId, dateIso, forceRefresh) => callPost('os_ops_todo_day', {
      standortId: standortId,
      date: dateIso || '',
      forceRefresh: !!forceRefresh
    }),
    toggleOpsTodoTask: (standortId, dateIso, row, checkCol, done) => callPost('os_ops_todo_toggle', {
      standortId: standortId,
      date: dateIso || '',
      row: row,
      checkCol: checkCol,
      done: !!done
    }),
    addOpsTodoTask: (standortId, dateIso, shift, text) => callPost('os_ops_todo_add', {
      standortId: standortId,
      date: dateIso || '',
      shift: shift || 'Früh',
      text: text || ''
    }),
    saveOpsTodoNote: (standortId, dateIso, rating, note) => callPost('os_ops_todo_note', {
      standortId: standortId,
      date: dateIso || '',
      rating: rating,
      note: note
    }),
    getOpsPutzplanDay: (standortId, dateIso) => callPost('os_ops_putzplan_day', {
      standortId: standortId,
      date: dateIso || ''
    }),
    toggleOpsPutzplanTask: (standortId, dateIso, col, done, person) => callPost('os_ops_putzplan_toggle', {
      standortId: standortId,
      date: dateIso || '',
      col: col,
      done: !!done,
      person: person || ''
    }),
    saveOpsPutzplanMeta: (standortId, dateIso, person, remark) => callPost('os_ops_putzplan_meta_save', {
      standortId: standortId,
      date: dateIso || '',
      person: person,
      remark: remark
    }),
    getModuleLaunchUrl: (moduleKey, standortId) => callPost('os_module_launch', {
      moduleKey: moduleKey,
      standortId: standortId
    })
  };
})();
