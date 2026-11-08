/**
 * The framework owns `/sign-in`, `/login` and `/signup` and serves them before
 * the React router runs, so the real sign-in and sign-up screens live at these
 * app routes instead (see `app/routes/auth.sign-in.tsx`).
 */
const SIGN_IN_SCREEN_PATH = "/auth/sign-in";
const SIGN_UP_SCREEN_PATH = "/auth/sign-up";

/**
 * Forwards the browser from a framework sign-in entry to the Super Acharya
 * screen, keeping the query string (`c`, `verified`, `error`, ...) and hash so
 * every framework redirect to sign-in (session gate, email links, OAuth
 * errors) lands on the screen with its return target intact.
 *
 * The document is static and shared, so it holds no per-request data: the
 * screen and the app base path are read from the requested URL in the browser.
 */
const FORWARD_SCRIPT = `(function () {
  var location = window.location;
  var entry = /\\/(?:_agent-native\\/sign-in|sign-in|login|signup)\\/?$/;
  var base = location.pathname.replace(entry, "");
  var wantsSignUp =
    /\\/signup\\/?$/.test(location.pathname) ||
    new URLSearchParams(location.search).get("tab") === "signup";
  var screen = wantsSignUp ? ${JSON.stringify(SIGN_UP_SCREEN_PATH)} : ${JSON.stringify(SIGN_IN_SCREEN_PATH)};
  location.replace(base + screen + location.search + location.hash);
})();`;

/** `loginHtml` for the auth plugin: a static document that forwards to the app screens. */
export const SIGN_IN_ENTRY_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Super Acharya</title>
<style>html,body{margin:0;background:#fff8e1;color:#000;font-family:system-ui,sans-serif}</style>
<script>${FORWARD_SCRIPT}</script>
</head>
<body>
<noscript><p style="padding:2rem"><a href="${SIGN_IN_SCREEN_PATH}">Continue to sign in</a></p></noscript>
</body>
</html>`;
