// ------- Reto 8: Recuperación persistente por navegador, sin identificar por nombre -------
const TAB_KEY = 'chat.session', PROFILES_KEY = 'chat.profiles.v1', LAST_KEY = 'chat.lastProfile';
function profiles() { try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]'); } catch { return []; } }
export function tokenForName(name) { return profiles().find(p => p.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())?.token || null; }
export function savedToken() {
  try {
    const tab = sessionStorage.getItem(TAB_KEY);
    if (tab) return tab;
    const last = localStorage.getItem(LAST_KEY);
    return profiles().find(p => p.id === last)?.token || null;
  } catch { return null; }
}
export function saveSession(user, token) {
  try {
    sessionStorage.setItem(TAB_KEY, token);
    const list = profiles().filter(p => p.id !== user.id);
    list.unshift({ id: user.id, name: user.name, token });
    localStorage.setItem(PROFILES_KEY, JSON.stringify(list.slice(0, 20)));
    localStorage.setItem(LAST_KEY, user.id);
    return true;
  } catch { return false; }
}
export function forgetInvalidToken(token) {
  try {
    if (sessionStorage.getItem(TAB_KEY) === token) sessionStorage.removeItem(TAB_KEY);
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles().filter(p => p.token !== token)));
  } catch {}
}
export function clearTabToken() { try { sessionStorage.removeItem(TAB_KEY); } catch {} }
