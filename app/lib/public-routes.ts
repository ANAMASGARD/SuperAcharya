export const LANDING_PATH = "/";

/** Only the marketing landing is public; all app routes require a session. */
export function isPublicLandingPath(pathname: string): boolean {
  const path =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  return path === LANDING_PATH;
}
