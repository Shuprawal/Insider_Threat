// // // // central, single source of truth for auth
// // // import axios from "axios";
// // //
// // // export const TOKEN_KEY = "custom_token";
// // // const REMEMBER_KEY = "remember_me";
// // //
// // // export function saveToken(token, remember) {
// // //   if (remember) {
// // //     localStorage.setItem(TOKEN_KEY, token);
// // //     localStorage.setItem(REMEMBER_KEY, "1");
// // //     sessionStorage.removeItem(TOKEN_KEY);
// // //   } else {
// // //     sessionStorage.setItem(TOKEN_KEY, token);
// // //     localStorage.removeItem(TOKEN_KEY);
// // //     localStorage.removeItem(REMEMBER_KEY);
// // //   }
// // //   setAuthHeader(token);
// // // }
// // //
// // // export function getToken() {
// // //   return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
// // // }
// // //
// // // export function isRemembered() {
// // //   return !!localStorage.getItem(REMEMBER_KEY);
// // // }
// // //
// // // export function clearToken() {
// // //   sessionStorage.removeItem(TOKEN_KEY);
// // //   localStorage.removeItem(TOKEN_KEY);
// // //   localStorage.removeItem(REMEMBER_KEY);
// // //   setAuthHeader(null);
// // // }
// // //
// // // export function setAuthHeader(token = getToken()) {
// // //   if (token) {
// // //     axios.defaults.headers.common.Authorization = `Bearer ${token}`;
// // //   } else {
// // //     delete axios.defaults.headers.common.Authorization;
// // //   }
// // // }
// // //
// // // // (nice-to-have) ensure every request re-reads latest token
// // // axios.interceptors.request.use((config) => {
// // //   const t = getToken();
// // //   if (t) config.headers.Authorization = `Bearer ${t}`;
// // //   return config;
// // // });
// // //
// // //
// // // // export const TOKEN_KEY = "custom_token";
// // // // export function getToken() {
// // // //   return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
// // // // }
// // //
// // //
// // //
// // //
// //
// //
// // // src/components/authStorage.js
// // // central, single source of truth for auth
// // import axios from "axios";
// //
// // export const TOKEN_KEY = "custom_token";
// // const REMEMBER_KEY = "remember_me";
// //
// // /** Save token to the right storage and prime axios */
// // export function saveToken(token, remember) {
// //   if (remember) {
// //     localStorage.setItem(TOKEN_KEY, token);
// //     localStorage.setItem(REMEMBER_KEY, "1");
// //     sessionStorage.removeItem(TOKEN_KEY);
// //   } else {
// //     sessionStorage.setItem(TOKEN_KEY, token);
// //     localStorage.removeItem(TOKEN_KEY);
// //     localStorage.removeItem(REMEMBER_KEY);
// //   }
// //   setAuthHeader(token);
// // }
// //
// // /** Read token (session wins, then local) */
// // export function getToken() {
// //   const t = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
// //   return t ? t.trim() : null;
// // }
// //
// //
// // export function isRemembered() {
// //   return !!localStorage.getItem(REMEMBER_KEY);
// // }
// //
// // export function clearToken() {
// //   sessionStorage.removeItem(TOKEN_KEY);
// //   localStorage.removeItem(TOKEN_KEY);
// //   localStorage.removeItem(REMEMBER_KEY);
// //   setAuthHeader(null);
// // }
// //
// // /** Keep axios in sync with current token */
// // export function setAuthHeader(token = getToken()) {
// //   if (token) {
// //     axios.defaults.headers.common.Authorization = `Bearer ${token}`;
// //   } else {
// //     delete axios.defaults.headers.common.Authorization;
// //   }
// // }
// //
// //
// // axios.interceptors.request.use((config) => {
// //   const t = getToken();
// //   if (t) config.headers.Authorization = `Bearer ${t}`;
// //   return config;
// // });
// //
// //
// //
// // // --- Dev helpers (optional) ---
// // window.setDevToken = function setDevToken(jwt, remember = true) {
// //   if (!jwt || typeof jwt !== "string") {
// //     console.warn("setDevToken: provide a JWT string");
// //     return;
// //   }
// //   saveToken(jwt, remember);
// //   console.log("✅ JWT saved under 'custom_token'. Reloading…");
// //   setTimeout(() => window.location.reload(), 150);
// // };
// //
// // window.clearDevToken = function clearDevToken() {
// //   clearToken();
// //   console.log("🧹 token cleared; reloading…");
// //   setTimeout(() => window.location.reload(), 150);
// // };
//
//
//
//
// // central, single source of truth for auth
// import axios from "axios";
//
// /** Single key used everywhere (localStorage or sessionStorage). */
// export const TOKEN_KEY = "custom_token";
// const REMEMBER_KEY = "remember_me";
//
// /* ───────────── helpers ───────────── */
//
// const tidy = (t) => (t == null ? null : String(t).trim());
//
// /** Persist token either in localStorage (remember) or sessionStorage. */
// export function saveToken(token, remember) {
//   const clean = tidy(token);
//   if (!clean) {
//     clearToken();
//     return;
//   }
//
//   if (remember) {
//     localStorage.setItem(TOKEN_KEY, clean);
//     localStorage.setItem(REMEMBER_KEY, "1");
//     sessionStorage.removeItem(TOKEN_KEY);
//   } else {
//     sessionStorage.setItem(TOKEN_KEY, clean);
//     localStorage.removeItem(TOKEN_KEY);
//     localStorage.removeItem(REMEMBER_KEY);
//   }
//   setAuthHeader(clean);
// }
//
// /** Read token (trimmed) from sessionStorage first, then localStorage. */
// export function getToken() {
//   const s = tidy(sessionStorage.getItem(TOKEN_KEY));
//   const l = tidy(localStorage.getItem(TOKEN_KEY));
//   return s || l || null;
// }
//
// export function isRemembered() {
//   return !!localStorage.getItem(REMEMBER_KEY);
// }
//
// /** Remove token from all stores and axios. */
// export function clearToken() {
//   sessionStorage.removeItem(TOKEN_KEY);
//   localStorage.removeItem(TOKEN_KEY);
//   localStorage.removeItem(REMEMBER_KEY);
//   setAuthHeader(null);
// }
//
// /** Keep axios default header in sync. */
// export function setAuthHeader(token = getToken()) {
//   const clean = tidy(token);
//   if (clean) {
//     axios.defaults.headers.common.Authorization = `Bearer ${clean}`;
//   } else {
//     delete axios.defaults.headers.common.Authorization;
//   }
// }
//
// /** Always attach the freshest token just before the request leaves. */
// axios.interceptors.request.use((config) => {
//   const t = getToken();
//   if (t) config.headers.Authorization = `Bearer ${tidy(t)}`;
//   return config;
// });
//
// /* ───────────── dev helpers (optional) ─────────────
//    Usage in Console:
//      window.setDevToken('<JWT>', { remember: true, reload: true })
//      window.clearDevToken(true)
// */
// if (typeof window !== "undefined") {
//   window.setDevToken = (jwt, opts = {}) => {
//     const { remember = false, reload = false } = opts;
//     saveToken(jwt, remember);
//     if (reload) window.location.reload();
//   };
//   window.clearDevToken = (reload = false) => {
//     clearToken();
//     if (reload) window.location.reload();
//   };
// }


// central, single source of truth for auth
import axios from "axios";

/** Keys */
export const TOKEN_KEY = "custom_token";
const REMEMBER_KEY = "remember_me";

/** WS-only override (for testing sockets without touching the API session) */
export const WS_TOKEN_OVERRIDE_KEY = "custom_token_ws_override";

/* ───────────── helpers ───────────── */

const tidy = (t) => (t == null ? null : String(t).trim());

/** Persist token.
 *  NOTE: when remember=true we keep a copy in BOTH storages so the
 *  current session survives the immediate reload.
 */
export function saveToken(token, remember) {
  const clean = tidy(token);
  if (!clean) {
    clearToken();
    return;
  }

  if (remember) {
    localStorage.setItem(TOKEN_KEY, clean);
    localStorage.setItem(REMEMBER_KEY, "1");
    // keep the session copy too → prevents an instant logout on reload
    sessionStorage.setItem(TOKEN_KEY, clean);
  } else {
    sessionStorage.setItem(TOKEN_KEY, clean);
    // don't delete the local copy; just mark not remembered
    localStorage.removeItem(REMEMBER_KEY);
  }
  setAuthHeader(clean);
}

/** Read token (trimmed) from sessionStorage first, then localStorage. */
export function getToken() {
  const s = tidy(sessionStorage.getItem(TOKEN_KEY));
  const l = tidy(localStorage.getItem(TOKEN_KEY));
  return s || l || null;
}

export function isRemembered() {
  return !!localStorage.getItem(REMEMBER_KEY);
}

/** Remove token from all stores and axios. */
export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REMEMBER_KEY);
  setAuthHeader(null);
}

/** Keep axios default header in sync. */
export function setAuthHeader(token = getToken()) {
  const clean = tidy(token);
  if (clean) {
    axios.defaults.headers.common.Authorization = `Bearer ${clean}`;
  } else {
    delete axios.defaults.headers.common.Authorization;
  }
}

/** Always attach the freshest token just before the request leaves. */
axios.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers.Authorization = `Bearer ${tidy(t)}`;
  return config;
});

/* ───────────── WS override helpers ───────────── */

export const getWsTokenOverride = () => {
  const t = localStorage.getItem(WS_TOKEN_OVERRIDE_KEY);
  return t ? t.trim() : null;
};

export const setWsTokenOverride = (jwt) => {
  const clean = tidy(jwt);
  if (clean) localStorage.setItem(WS_TOKEN_OVERRIDE_KEY, clean);
};

export const clearWsTokenOverride = () => {
  localStorage.removeItem(WS_TOKEN_OVERRIDE_KEY);
};

/* ───────────── dev helpers for console (optional) ─────────────
   Examples:
     window.setDevToken('<JWT>', { remember: true, reload: true })
     window.clearDevToken(true)

     // WS-only override (doesn't affect API session):
     window.setWsDevToken('<JWT>', { reload: true })
     window.clearWsDevToken(true)
*/
if (typeof window !== "undefined") {
  window.setDevToken = (jwt, opts = {}) => {
    const { remember = false, reload = false } = opts;
    saveToken(jwt, remember);
    if (reload) window.location.reload();
  };
  window.clearDevToken = (reload = false) => {
    clearToken();
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
