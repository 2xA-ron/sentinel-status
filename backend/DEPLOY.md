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
* `VITE_SSR_API_BASE_URL` (optional, but required if the API sits behind a
  custom domain on the *same* Cloudflare zone as the frontend, e.g.
  `api.yourdomain.com` when the frontend is `yourdomain.com`) — the raw Cloud
  Run URL, e.g. `https://sentinelops-api-xxxxx-uc.a.run.app`. SSR runs inside
  the Cloudflare Worker itself, so a fetch to the custom API domain is a
  same-zone subrequest; if Bot Fight Mode (or similar) is enabled on the
  zone, it challenges that subrequest with a JS page the Worker can't solve,
  and SSR gets HTML back instead of JSON. Setting this makes SSR bypass
  Cloudflare and hit Cloud Run directly, while the browser keeps using
  `VITE_API_BASE_URL` unchanged. See `src/lib/api/real.ts`.

The workflows read these through `${{ secrets.SECRET_NAME }}`. Do not replace
those expressions with literal credentials. The local `.env` file is only for
local development and is ignored by git.

## 2. Provision PostgreSQL (free tier)

Cloud Run is serverless — its filesystem is ephemeral. When your API restarts
or scales to zero, any SQLite `.db` file vanishes. PostgreSQL lives outside
Cloud Run so your data survives.

**Recommended: Neon** (neon.tech) — free tier includes 0.5 GB storage, 1 project.

1. Sign up at https://neon.tech
2. Create a project named `sentinelops`
3. Copy the connection string from the dashboard (looks like
   `postgresql://sentinelops:password@ep-xxx.us-east-2.aws.neon.tech/sentinelops?sslmode=require`)
4. Convert it to Npgsql format:
   `Host=ep-xxx.us-east-2.aws.neon.tech;Database=sentinelops;Username=sentinelops;Password=password;SSL Mode=Require`

Other free PostgreSQL options: Supabase (500 MB), Aiven, Render (90 days).

## 3. Provision Redis (free tier, optional but recommended)

Redis powers the SignalR backplane (so messages reach all clients regardless of
which Cloud Run instance they hit) and will be used for rate limiting and
caching. Works without Redis — SignalR falls back to in-memory for single-instance.

**Recommended: Upstash** (upstash.com) — free tier 256 MB.

1. Sign up at https://upstash.com
2. Create a Redis database
3. Copy the connection string (`rediss://...`)

## 4. Deploy the API to Cloud Run

Run from the repo root. `--source` builds the `Dockerfile` already added at
`backend/SentinelOps.Api/Dockerfile` via Cloud Build — no local Docker needed.

```bash
gcloud run deploy sentinelops-api \
  --source backend/SentinelOps.Api \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars CONNECTION_STRING="Host=ep-xxx.us-east-2.aws.neon.tech;Database=sentinelops;Username=sentinelops;Password=password;SSL Mode=Require" \
  --set-env-vars REDIS_CONNECTION="rediss://default:password@xxx.upstash.io:6379" \
  --set-env-vars FRONTEND_ORIGINS=https://runtimem3sh.dev
```

Note the `Service URL` it prints (something like
`https://sentinelops-api-xxxxx-uc.a.run.app`) — you'll need it in step 5.

## 5. Point the frontend at it

```bash
cp .env.example .env   # if you haven't already
# set: VITE_API_BASE_URL=https://sentinelops-api-xxxxx-uc.a.run.app
npm run deploy:cloudflare
```

Note the frontend URL Wrangler prints (a `*.workers.dev` URL, or your
Cloudflare custom domain/route if you've mapped one).

## 6. Close the loop: update CORS with the real frontend URL

```bash
gcloud run services update sentinelops-api \
  --region us-central1 \
  --set-env-vars FRONTEND_ORIGINS=https://<your-actual-frontend-domain>
```

`FRONTEND_ORIGINS` is comma-separated if you need more than one origin (e.g.
a `*.workers.dev` URL plus a custom domain).

## 7. Put the API behind your own domain via Cloudflare

For a proxied CNAME to Cloud Run, Cloudflare must send the Cloud Run service
hostname as the origin `Host` header. Otherwise Cloud Run can return Google
404 responses even though the same API route works on the `run.app` URL.

1. In Cloudflare DNS, add a `CNAME` record: `api.yourdomain.com` →
   `sentinelops-api-xxxxx-uc.a.run.app`, proxy status **Proxied** (orange
   cloud).
2. Create a Cloudflare **Origin Rule** for the hostname
  `api.yourdomain.com`. Set **Host Header** (under origin request settings)
  to the exact Cloud Run hostname from the CNAME, for example
  `sentinelops-api-xxxxx-uc.a.run.app`.
3. In Cloudflare SSL/TLS settings, use **Full** or **Full (strict)**. The
  origin certificate is for the `run.app` hostname, so the origin hostname
  in the rule must match the CNAME target.
4. Re-run step 6 with `FRONTEND_ORIGINS` unchanged, but now use
   `https://api.yourdomain.com` as `VITE_API_BASE_URL` in step 5 instead of
   the raw `*.run.app` URL, then redeploy the frontend.

WebSockets (the `/realtime` SignalR hub) pass through Cloudflare's proxy on
the free plan by default — nothing extra to enable.

Verify the origin and custom hostname separately:

```bash
curl -i https://sentinelops-api-xxxxx-uc.a.run.app/api/status
curl -i https://api.yourdomain.com/api/status
```

Both requests should return HTTP 200. A `404` from the custom hostname while
the `run.app` request returns `200` means the Origin Rule is missing or its
host value does not exactly match the Cloud Run hostname.

## 8. Deploy regional checking agents (real multi-region checking)

The API service you deployed in step 4 also runs one regional checking agent
in-process, for region id `us-central1` (the default when `AGENT_REGION` is
unset). To get real multi-region checking — detecting "down from one region,
up from another" — deploy 2 more regional agents as separate Cloud Run
services, built from the exact same source, but running in **agent-only
mode**: no `CONNECTION_STRING` set, so `Program.cs` skips the database/API
entirely and just polls the orchestrator over HTTP (see
`backend/SentinelOps.Api/Services/RemoteAgentService.cs`).

1. Pick a shared secret the orchestrator and every agent will use to
   authenticate to each other, e.g. `openssl rand -hex 32`.

2. Set it on the **existing** `sentinelops-api` service too (one-time, like
   `FRONTEND_ORIGINS` in step 6 — CI redeploys reuse it automatically after
   this):

   ```bash
   gcloud run services update sentinelops-api \
     --region us-central1 \
     --set-env-vars AGENT_SHARED_SECRET=<the-secret-from-step-1>
   ```

3. Deploy the 2 agent services (first time only — after this,
   `.github/workflows/deploy-backend.yml`'s `deploy-agents` job redeploys the
   same source on every push automatically, reusing these env vars):

   ```bash
   gcloud run deploy sentinelops-agent-us-east1 \
     --source backend/SentinelOps.Api \
     --region us-east1 \
     --allow-unauthenticated \
     --set-env-vars AGENT_REGION=us-east1,ORCHESTRATOR_URL=https://sentinelops-api-xxxxx-uc.a.run.app,AGENT_SHARED_SECRET=<the-secret-from-step-1>

   gcloud run deploy sentinelops-agent-europe-west1 \
     --source backend/SentinelOps.Api \
     --region europe-west1 \
     --allow-unauthenticated \
     --set-env-vars AGENT_REGION=europe-west1,ORCHESTRATOR_URL=https://sentinelops-api-xxxxx-uc.a.run.app,AGENT_SHARED_SECRET=<the-secret-from-step-1>
   ```

   Replace the `sentinelops-api-xxxxx-uc.a.run.app` URL with the real one
   from step 4 (or your custom `api.yourdomain.com` domain from step 7 — either
   works, since these agents call it like any other client). `--allow-unauthenticated`
   is fine here: these services have no database access and expose only a
   trivial `/health` endpoint for Cloud Run's own liveness probe — the actual
   `/api/agents/*` endpoints they call live on the orchestrator, gated by the
   shared secret, not by anything on the agent side.

4. Verify: `curl https://sentinelops-api-xxxxx-uc.a.run.app/api/agents` should
   return 3 rows (`us-central1`, `us-east1`, `europe-west1`) with a fresh
   `lastHeartbeat` on each, once all 3 have had a chance to check in
   (heartbeats fire every ~15s).

A monitor's `Regions` field now has real effect: only agents whose region id
appears in a monitor's `Regions` will ever check it. If you add a region
beyond these 3, add it to `RegionNames` in
`backend/SentinelOps.Api/Services/RegionNames.cs` and to `ALL_REGIONS` in
`src/components/monitors/MonitorForm.tsx` too, so the picklist and the
deployed fleet stay in sync — v1 doesn't discover regions dynamically.

## 9. CI/CD via GitHub Actions

Two workflows automate steps 2–5 (plus the 2 regional agents from step 8,
once they exist) on every push to `main`:

- `.github/workflows/deploy-backend.yml` — redeploys the API when
  `backend/**` changes, then redeploys both regional agent services with the
  same source (its `deploy-agents` job — a no-op failure if you haven't done
  step 8 yet, since those services won't exist).
- `.github/workflows/deploy-frontend.yml` — rebuilds and redeploys the
  frontend when frontend source changes.

Both also support manual runs from the Actions tab (`workflow_dispatch`).
They only run steps 2–5 — do step 6 (updating `FRONTEND_ORIGINS`) and step 7
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
| `VITE_API_BASE_URL` | frontend | the Cloud Run URL (or custom domain, once step 7 is done) |
| `VITE_SSR_API_BASE_URL` | frontend | the raw Cloud Run URL — only needed if the API sits behind a custom domain on the same Cloudflare zone as the frontend, see step 7's note in the secrets list above |

`CONNECTION_STRING`, `REDIS_CONNECTION`, and `AGENT_SHARED_SECRET` are **not**
GitHub secrets — they're set once directly on the Cloud Run services via
`gcloud run services update --set-env-vars` (steps 2/4 and step 8), and
`gcloud run deploy` reuses them on every subsequent CI redeploy without the
workflow needing to know their values.
