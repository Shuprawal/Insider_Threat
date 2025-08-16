// central, single source of truth for authentication handling
import axios from "axios";

/** Primary, long/unique storage keys */
export const TOKEN_STORAGE_KEY_MAIN = "custom_authentication_token_value";
export const REMEMBER_ME_STORAGE_KEY_MAIN = "custom_remember_me_indicator_value";
export const USER_PAYLOAD_STORAGE_KEY_MAIN = "custom_authenticated_user_payload_value";
export const WS_TOKEN_OVERRIDE_STORAGE_KEY_MAIN = "custom_ws_authentication_token_override_value";

/** ───────────── helpers ───────────── */

const tidyStoredTokenStringValue = (t) => (t == null ? null : String(t).trim());

/** Save token to storage (new API) */
export function saveTokenToStorageMain(tokenStringValue, rememberFlagValue) {
  const cleanedTokenValue = tidyStoredTokenStringValue(tokenStringValue);
  if (!cleanedTokenValue) {
    clearTokenFromStorageMain();
    return;
  }

  if (rememberFlagValue) {
    localStorage.setItem(TOKEN_STORAGE_KEY_MAIN, cleanedTokenValue);
    localStorage.setItem(REMEMBER_ME_STORAGE_KEY_MAIN, "1");
    sessionStorage.setItem(TOKEN_STORAGE_KEY_MAIN, cleanedTokenValue);
  } else {
    sessionStorage.setItem(TOKEN_STORAGE_KEY_MAIN, cleanedTokenValue);
    localStorage.removeItem(REMEMBER_ME_STORAGE_KEY_MAIN);
  }
  setAxiosAuthHeaderMain(cleanedTokenValue);
}

/** Store/get the authenticated user payload (role, username, etc.) */
export function saveAuthPayloadToStorageMain(userPayloadObject) {
  if (userPayloadObject) {
    localStorage.setItem(USER_PAYLOAD_STORAGE_KEY_MAIN, JSON.stringify(userPayloadObject));
  } else {
    localStorage.removeItem(USER_PAYLOAD_STORAGE_KEY_MAIN);
  }
}
export function getAuthPayloadFromStorageMain() {
  try {
    return JSON.parse(localStorage.getItem(USER_PAYLOAD_STORAGE_KEY_MAIN) || "null");
  } catch {
    return null;
  }
}

/** Read token (sessionStorage first, then localStorage) (new API) */
export function getTokenFromStorageMain() {
  const s = tidyStoredTokenStringValue(sessionStorage.getItem(TOKEN_STORAGE_KEY_MAIN));
  const l = tidyStoredTokenStringValue(localStorage.getItem(TOKEN_STORAGE_KEY_MAIN));
  return s || l || null;
}

/** Remember-me flag (new API) */
export function isRememberedInStorageMain() {
  return !!localStorage.getItem(REMEMBER_ME_STORAGE_KEY_MAIN);
}

/** Clear token (new API) */
export function clearTokenFromStorageMain() {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY_MAIN);
  localStorage.removeItem(TOKEN_STORAGE_KEY_MAIN);
  localStorage.removeItem(REMEMBER_ME_STORAGE_KEY_MAIN);
  setAxiosAuthHeaderMain(null);
}

/** Keep axios default header in sync (new API) */
export function setAxiosAuthHeaderMain(tokenValue = getTokenFromStorageMain()) {
  const cleanedTokenValue = tidyStoredTokenStringValue(tokenValue);
  if (cleanedTokenValue) {
    axios.defaults.headers.common.Authorization = `Bearer ${cleanedTokenValue}`;
  } else {
    delete axios.defaults.headers.common.Authorization;
  }
}

/** Always attach freshest token just before request leaves */
axios.interceptors.request.use((config) => {
  const t = getTokenFromStorageMain();
  if (t) config.headers.Authorization = `Bearer ${tidyStoredTokenStringValue(t)}`;
  return config;
});

/* ───────────── WebSocket override helpers (unchanged) ───────────── */
export const getWsTokenOverride = () => {
  const t = localStorage.getItem(WS_TOKEN_OVERRIDE_STORAGE_KEY_MAIN);
  return t ? t.trim() : null;
};
export const setWsTokenOverride = (jwt) => {
  const clean = tidyStoredTokenStringValue(jwt);
  if (clean) localStorage.setItem(WS_TOKEN_OVERRIDE_STORAGE_KEY_MAIN, clean);
};
export const clearWsTokenOverride = () => {
  localStorage.removeItem(WS_TOKEN_OVERRIDE_STORAGE_KEY_MAIN);
};

/* ───────────── Backwards-compat aliases (DO NOT BREAK EXISTING IMPORTS) ─────────────
   Old names that other files import:
   - TOKEN_KEY, REMEMBER_KEY, WS_TOKEN_OVERRIDE_KEY
   - getToken, saveToken, clearToken, setAuthHeader, isRemembered
*/
export const TOKEN_KEY = TOKEN_STORAGE_KEY_MAIN;
export const REMEMBER_KEY = REMEMBER_ME_STORAGE_KEY_MAIN;
export const WS_TOKEN_OVERRIDE_KEY = WS_TOKEN_OVERRIDE_STORAGE_KEY_MAIN;

export function getToken() {
  return getTokenFromStorageMain();
}
export function saveToken(token, remember) {
  return saveTokenToStorageMain(token, remember);
}
export function clearToken() {
  return clearTokenFromStorageMain();
}
export function setAuthHeader(token = getTokenFromStorageMain()) {
  return setAxiosAuthHeaderMain(token);
}
export function isRemembered() {
  return isRememberedInStorageMain();
}

/* ───────────── Dev helpers (optional) ───────────── */
if (typeof window !== "undefined") {
  window.setDevToken = (jwt, opts = {}) => {
    const { remember = false, reload = false } = opts;
    saveTokenToStorageMain(jwt, remember);
    if (reload) window.location.reload();
  };
  window.clearDevToken = (reload = false) => {
    clearTokenFromStorageMain();
    if (reload) window.location.reload();
  };
  window.setWsDevToken = (jwt, opts = {}) => {
    const { reload = false } = opts;
    setWsTokenOverride(jwt);
    if (reload) window.location.reload();
  };
  window.clearWsDevToken = (reload = false) => {
    clearWsTokenOverride();
    if (reload) window.location.reload();
  };
}
