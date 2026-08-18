# Deploying the backend to Cloud Run (free tier) + Cloudflare in front

This assumes the frontend deploys to Cloudflare via `npm run deploy:cloudflare`
(see the root `README.md`). These are the commands to run yourself — they need
your own `gcloud` login and GCP project, which this environment doesn't have.

## 0. One-time setup

```bash
# Install: https://cloud.google.com/sdk/docs/install
gcloud auth login
gcloud projects create sentinelops-<your-suffix>   # or reuse an existing project
gcloud config set project sentinelops-<your-suffix>
gcloud services enable run.googleapis.com cloudbuild.googleapis.com
```

A billing account must be attached to the project even for free-tier usage,
but nothing is charged as long as you stay under the always-free Cloud Run
quota (2M requests/mo, 360k GB-seconds, 180k vCPU-seconds/mo). Consider
setting a budget alert as a safety net.

## Where deployment values go

The values in the GitHub Actions secret table at the end of this document do
not belong in this file or in the repository. Add them as **repository secrets**
at:

`https://github.com/2xA-ron/sentinel-status/settings/secrets/actions`

Choose **New repository secret** and add each name separately:

* `GCP_PROJECT_ID` — Google Cloud project ID.
* `GCP_SA_KEY` — complete Google service-account JSON; never commit this file.
* `CLOUDFLARE_API_TOKEN` — scoped Cloudflare Workers deployment token.
* `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID.
* `VITE_API_BASE_URL` — deployed API URL, such as `https://sentinelops-api-xxxxx-uc.a.run.app`.

The workflows read these through `${{ secrets.SECRET_NAME }}`. Do not replace
those expressions with literal credentials. The local `.env` file is only for
local development and is ignored by git.

## 1. Deploy the API to Cloud Run

Run from the repo root. `--source` builds the `Dockerfile` already added at
`backend/SentinelOps.Api/Dockerfile` via Cloud Build — no local Docker needed.

```bash
gcloud run deploy sentinelops-api \
  --source backend/SentinelOps.Api \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars FRONTEND_ORIGINS=https://placeholder.pages.dev
```

Note the `Service URL` it prints (something like
`https://sentinelops-api-xxxxx-uc.a.run.app`) — you'll need it in step 2.

## 2. Point the frontend at it

```bash
cp .env.example .env   # if you haven't already
# set: VITE_API_BASE_URL=https://sentinelops-api-xxxxx-uc.a.run.app
npm run deploy:cloudflare
```

Note the frontend URL Wrangler prints (a `*.workers.dev` URL, or your
Cloudflare custom domain/route if you've mapped one).

## 3. Close the loop: update CORS with the real frontend URL

```bash
gcloud run services update sentinelops-api \
  --region us-central1 \
  --set-env-vars FRONTEND_ORIGINS=https://<your-actual-frontend-domain>
```

`FRONTEND_ORIGINS` is comma-separated if you need more than one origin (e.g.
a `*.workers.dev` URL plus a custom domain).

## 4. Optional: put the API behind your own domain via Cloudflare

Simplest approach — no Cloud Run domain mapping needed, keeps Cloudflare's
proxy/WAF in front:

1. In Cloudflare DNS, add a `CNAME` record: `api.yourdomain.com` →
   `sentinelops-api-xxxxx-uc.a.run.app`, proxy status **Proxied** (orange
   cloud).
2. In Cloudflare SSL/TLS settings, set the mode to **Full** (not Flexible,
   not Full Strict — Cloud Run's cert is valid for `*.run.app`, not your
   custom domain, so Full works without extra cert setup).
3. Re-run step 3 with `FRONTEND_ORIGINS` unchanged, but now use
   `https://api.yourdomain.com` as `VITE_API_BASE_URL` in step 2 instead of
   the raw `*.run.app` URL, then redeploy the frontend.

WebSockets (the `/realtime` SignalR hub) pass through Cloudflare's proxy on
the free plan by default — nothing extra to enable.

## 5. CI/CD via GitHub Actions

Two workflows automate steps 1–2 on every push to `main`:

- `.github/workflows/deploy-backend.yml` — redeploys the API when
  `backend/**` changes.
- `.github/workflows/deploy-frontend.yml` — rebuilds and redeploys the
  frontend when frontend source changes.

Both also support manual runs from the Actions tab (`workflow_dispatch`).
They only run steps 1–2 — do step 3 (updating `FRONTEND_ORIGINS`) and step 4
(custom domain) by hand once, since those rarely change.

### One-time setup: GCP service account for GitHub Actions

```bash
export PROJECT_ID=sentinelops-<your-suffix>

gcloud iam service-accounts create gh-actions-deployer \
  --display-name "GitHub Actions deployer"

export SA="gh-actions-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

for role in roles/run.admin roles/storage.admin \
            roles/artifactregistry.writer roles/cloudbuild.builds.editor \
            roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA}" \
    --role="$role"
done

gcloud iam service-accounts keys create gh-actions-key.json \
  --iam-account "$SA"
```

Those roles cover what `gcloud run deploy --source` needs: deploying the
Cloud Run service, and letting the Cloud Build it kicks off upload source,
build the image, and push it to Artifact Registry.

Paste the contents of `gh-actions-key.json` into a GitHub repo secret named
`GCP_SA_KEY`, then delete the local file:

```bash
rm gh-actions-key.json
```

This uses a long-lived service account key for simplicity. If you want to
harden this later, swap it for
[Workload Identity Federation](https://github.com/google-github-actions/auth#setting-up-workload-identity-federation)
so no key ever leaves Google — not necessary to get this working, worth doing
before this handles anything beyond a demo.

### One-time setup: Cloudflare API token

In the Cloudflare dashboard → **My Profile → API Tokens → Create Token**,
use the **Edit Cloudflare Workers** template (scoped to your account, no need
for broader access).

### GitHub repo secrets

Add these under **Settings → Secrets and variables → Actions**:

| Secret | Used by | Value |
| --- | --- | --- |
| `GCP_PROJECT_ID` | backend | your GCP project ID |
| `GCP_SA_KEY` | backend | contents of `gh-actions-key.json` |
| `CLOUDFLARE_API_TOKEN` | frontend | token from the step above |
| `CLOUDFLARE_ACCOUNT_ID` | frontend | Cloudflare dashboard → right sidebar of any domain, or Workers & Pages overview |
| `VITE_API_BASE_URL` | frontend | the Cloud Run URL (or custom domain, once step 4 is done) |
