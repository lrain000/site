/* GitHub OAuth for the content manager at /admin.
 *
 * Sveltia and Decap can't hold a GitHub client secret — they run in the
 * browser — so the secret lives here and this worker performs the token
 * exchange on their behalf. It is the piece the label's site gets from
 * Netlify's Git Gateway, which doesn't exist on Cloudflare.
 *
 * Flow:
 *   1. The CMS opens a popup at <worker>/auth
 *   2. We bounce it to GitHub with a signed-ish state value
 *   3. GitHub returns the visitor to <worker>/callback?code=...
 *   4. We swap the code for an access token
 *   5. We hand the token to the CMS window via postMessage and close
 *
 * No secrets in this file: set them with `wrangler secret put`.
 */

// Only these origins may receive a token. Anything else that opens this
// worker gets nothing back — without this, any site could start the flow
// and harvest a token with write access to the repo.
const ALLOWED_ORIGINS = [
  'https://www.lrain.info',
  'https://lrain.info',
];

// The repo is public, so public_repo is enough to commit content. Full
// "repo" scope would also hand over every private repo on the account.
const SCOPE = 'public_repo';

const STATE_COOKIE = '__Host-cms_state';

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/* Step 1–2: start the dance. */
function startAuth(url, env) {
  if (!env.GITHUB_CLIENT_ID) {
    return html('<p>GITHUB_CLIENT_ID is not set on this worker.</p>', 500);
  }

  const state = crypto.randomUUID();
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authorize.searchParams.set('scope', SCOPE);
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('redirect_uri', `${url.origin}/callback`);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      // __Host- prefix requires Secure, Path=/ and no Domain — it also stops
      // a subdomain from writing this cookie.
      'Set-Cookie': `${STATE_COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
      'cache-control': 'no-store',
    },
  });
}

/* Step 3–5: finish it. */
async function finishAuth(url, env, request) {
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const expectedState = readCookie(request, STATE_COOKIE);

  if (url.searchParams.get('error')) {
    return renderResult({ error: url.searchParams.get('error_description') || url.searchParams.get('error') });
  }
  if (!code) return renderResult({ error: 'GitHub did not return a code.' });

  // CSRF: the state we set must be the state that comes back.
  if (!expectedState || returnedState !== expectedState) {
    return renderResult({ error: 'State mismatch — start the sign-in again.' });
  }

  let token, error;
  try {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${url.origin}/callback`,
      }),
    });
    const data = await res.json();
    if (data.error) error = data.error_description || data.error;
    else if (!data.access_token) error = 'GitHub returned no access token.';
    else token = data.access_token;
  } catch (e) {
    error = 'Could not reach GitHub: ' + e.message;
  }

  return renderResult({ token, error });
}

/* The CMS listens for a postMessage from this popup. The handshake is:
   the popup announces itself, the CMS replies, and only then do we send the
   token — to that window's origin, and only if we allow it. */
function renderResult({ token, error }) {
  const payload = error
    ? `authorization:github:error:${JSON.stringify({ message: error })}`
    : `authorization:github:success:${JSON.stringify({ token, provider: 'github' })}`;

  return html(`<!DOCTYPE html>
<meta charset="utf-8">
<title>Signing in…</title>
<body style="font:14px/1.6 system-ui,sans-serif;padding:2rem">
<p>${error ? 'Sign-in failed: ' + escapeHtml(error) : 'Signed in. You can close this window.'}</p>
<script>
(function () {
  var ALLOWED = ${JSON.stringify(ALLOWED_ORIGINS)};
  var payload = ${JSON.stringify(payload)};

  function send(origin) {
    window.opener.postMessage(payload, origin);
  }

  if (!window.opener) { document.body.innerHTML += '<p>Opened directly — nothing to hand back.</p>'; return; }

  // Wait for the CMS to answer before releasing the token, and only ever
  // send it to an origin on the allowlist.
  window.addEventListener('message', function handler(e) {
    if (ALLOWED.indexOf(e.origin) === -1) return;
    send(e.origin);
    window.removeEventListener('message', handler, false);
    setTimeout(function () { window.close(); }, 500);
  }, false);

  // Announce ourselves to whoever opened us.
  ALLOWED.forEach(function (o) {
    try { window.opener.postMessage('authorizing:github', o); } catch (err) {}
  });
})();
</script>
</body>`);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/auth') return startAuth(url, env);
    if (url.pathname === '/callback') return finishAuth(url, env, request);
    if (url.pathname === '/') return html('<p>CMS auth worker. Sign in from /admin on the site.</p>');
    return new Response('Not found', { status: 404 });
  },
};
