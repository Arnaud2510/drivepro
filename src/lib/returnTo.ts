// Page to reopen after sign-in, sign-up and onboarding (e.g. a fleet invitation link).
const RETURN_KEY = 'drivepro:return-to';
export function rememberReturn(path: string) {
  try {
    sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    /* ignore */
  }
}
/** Returns (once) the page to go back to, defaulting to the dashboard. */
export function takeReturn(): string {
  try {
    const p = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    if (p?.startsWith('/app')) return p;
  } catch {
    /* ignore */
  }
  return '/app';
}
