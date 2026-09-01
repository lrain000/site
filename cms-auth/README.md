# CMS sign-in worker

The content manager at `/admin` commits to `lrain000/site` on the artist
team's behalf. To do that it needs a GitHub token, and to get one somebody
has to hold a GitHub client secret. A browser can't keep a secret, so this
worker holds it and does the token exchange.

On the label's site Netlify provides this as Git Gateway. Cloudflare has no
equivalent, so we run these ~140 lines instead.

---

## Setup

Roughly fifteen minutes, done once. Steps 1 and 2 need the shared
`lrain000` GitHub account; step 3 needs the Cloudflare account.

### 1. Create a GitHub OAuth app

Signed in as **lrain000**: Settings → Developer settings → **OAuth Apps** →
**New OAuth App**.

| Field | Value |
|---|---|
| Application name | `L'Rain site CMS` |
| Homepage URL | `https://www.lrain.info` |
| Authorization callback URL | `https://lrain-cms-auth.<your-subdomain>.workers.dev/callback` |

You won't know the exact callback URL until step 3 — put a placeholder in,
deploy, then come back and correct it. **The callback must match exactly**,
including `/callback` on the end. A mismatch is the usual cause of
"redirect_uri is not associated with this application".

Keep the **Client ID**, and generate a **Client secret**. Copy the secret
now; GitHub won't show it again.

### 2. Give that account access to the repo

The CMS writes as whoever signs in, so `lrain000` needs write access to
`lrain000/site`. It owns the repo, so this is already true — but if you
later switch to individual logins, each person needs collaborator access.

### 3. Deploy the worker

From this folder:

```
npx wrangler login
npx wrangler deploy
```

Wrangler prints the deployed URL, e.g.
`https://lrain-cms-auth.lrainwebsite.workers.dev`. Take that back to step 1
and set the callback URL to that address plus `/callback`.

### 4. Give the worker the secrets

```
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

Each prompts for the value and stores it with Cloudflare. They are never
written to the repo, and nobody needs to paste them into a file.

### 5. Point the CMS at the worker

In `admin/config.yml`, set `base_url` to the deployed worker URL — no
trailing slash, no `/auth`:

```yaml
backend:
  name: github
  repo: lrain000/site
  branch: main
  base_url: https://lrain-cms-auth.<your-subdomain>.workers.dev
```

Commit and let Cloudflare Pages redeploy.

### 6. Try it

Open `https://www.lrain.info/admin/`, click to sign in, approve the GitHub
prompt. You should land in the editor with Shop, Social links and Homepage.
Make a small change, save, and confirm a commit appears on `main` and the
site redeploys.

---

## Notes

**Scope is `public_repo`, not `repo`.** The repo is public, so that's enough
to commit content — and it means the token cannot touch any private repo on
the account. If the repo is ever made private, this has to become `repo`,
which is a much larger grant worth thinking about first.

**Only lrain.info can receive a token.** `ALLOWED_ORIGINS` in `worker.js`
lists the origins the popup will postMessage to. Any other site that starts
this flow gets nothing back. Add the `*.pages.dev` preview URL there
temporarily if you ever need to test the CMS off the live domain.

**A shared login has no audit trail.** Every change will show as `lrain000`
in the history, so you won't be able to tell who edited what. Fine for a
small team; if that changes, add people as collaborators and have them sign
in as themselves — no worker changes needed.

**This folder is published with the site.** `worker.js` will be readable at
`https://www.lrain.info/cms-auth/worker.js`. That's harmless — it holds no
secrets — but you can delete the folder after deploying if you'd rather it
weren't there. Keeping it means the next person can see how sign-in works.
