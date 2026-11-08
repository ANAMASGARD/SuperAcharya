export const LANDING_PATH = "/";
export const SIGN_IN_PATH = "/auth/sign-in";
export const SIGN_UP_PATH = "/auth/sign-up";

/** Prefix of the sign-in / sign-up screens. Matches `publicPaths` in `server/plugins/auth.ts`. */
const AUTH_SCREEN_PREFIX = "/auth";

function normalizePathname(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

export function isPublicLandingPath(pathname: string): boolean {
  return normalizePathname(pathname) === LANDING_PATH;
}

export function isAuthScreenPath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return path === AUTH_SCREEN_PREFIX || path.startsWith(`${AUTH_SCREEN_PREFIX}/`);
}

/**
 * Routes that render without a session and without the signed-in app shell:
 * the marketing landing and the sign-in / sign-up screens. Every other app
 * route requires a session.
 */
export function isPublicRoutePath(pathname: string): boolean {
  return isPublicLandingPath(pathname) || isAuthScreenPath(pathname);
}
