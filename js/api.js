'use strict';

(function() {
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
      return sessionStorage.getItem(window.SONA_OS_DEFAULTS.TOKEN_STORAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function setToken(token) {
    try {
      if (token) {
        sessionStorage.setItem(window.SONA_OS_DEFAULTS.TOKEN_STORAGE_KEY, token);
      } else {
        sessionStorage.removeItem(window.SONA_OS_DEFAULTS.TOKEN_STORAGE_KEY);
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
    return parsed;
  }

  window.SonaApi = {
    getGatewayUrl: getGatewayUrl,
    setGatewayUrl: setGatewayUrl,
    getToken: getToken,
    setToken: setToken,
    callPost: callPost,
    ping: () => callPost('os_ping', {}),
    listUsers: () => callPost('os_users', {}),
    login: (userId, pin, standortId) => callPost('os_login', { userId: userId, pin: pin, standortId: standortId }),
    checkSession: () => callPost('os_session_check', {}),
    switchLocation: (standortId) => callPost('os_switch_location', { standortId: standortId }),
    getRbacMatrix: () => callPost('os_rbac_list', {}),
    saveRbacRule: (rule) => callPost('os_rbac_save', { rule: rule }),
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
    })
  };
})();
