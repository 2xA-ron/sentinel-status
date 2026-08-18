# SentinelOps

A full-stack uptime monitoring and incident response dashboard. The React/TanStack
Start frontend talks to an ASP.NET Core 8 API backed by SQLite and receives live
check and incident updates over SignalR.

## Current implementation

The application is wired for local, end-to-end use:

* Create, edit, enable/disable, and delete HTTP monitors.
* Run real outbound checks on each monitor's configured interval.
* Persist check history, uptime statistics, and incidents in SQLite.
* Open, acknowledge, resolve, and add notes to incidents.
* Stream check and incident events to connected browsers with SignalR.
* View dashboard, monitor, incident, status page, agents, and settings screens.

The agent/region screen is currently a read-only preview. Checks are executed by
the ASP.NET process and are not yet distributed across multiple machines.

## Run locally

Prerequisites: Node.js/npm and the .NET 8 SDK.

Install the frontend dependencies once:

```sh
npm install
```

Start the API in terminal 1:

```sh
dotnet run --project backend/SentinelOps.Api/SentinelOps.Api.csproj --launch-profile http
```

The API listens on `http://localhost:5283` and exposes Swagger at
`http://localhost:5283/swagger`.

Start the frontend in terminal 2:

```sh
npm run dev
```

Open the local Vite URL shown in the terminal, normally
`http://localhost:5173`. The default frontend API URL is already
`http://localhost:5283`; use `.env` only when pointing at a deployed API:

```sh
cp .env.example .env
# edit VITE_API_BASE_URL as needed
```

### First useful demo

1. Open **Monitors** and create a monitor for a URL you control or a stable public endpoint such as `https://example.com`.
2. Use a short interval while testing, such as 15 seconds, and leave the expected status at `200`.
3. Return to the dashboard and watch the live connection indicator and event feed update after the check runs.
4. Create a deliberately failing monitor, or temporarily use an invalid URL, to demonstrate degraded/down state and incident creation after three consecutive failures.
5. Acknowledge and resolve the incident, then inspect its timeline and the monitor's check history.

Runtime data is stored in `sentinelops.db` in the directory where the API process
starts and is ignored by git. From the repository-root command above, delete
`sentinelops.db` when you want a clean local demo database.

## Always-on Raspberry Pi 5

The Pi is a good home monitor host. Use a 64-bit Raspberry Pi OS install with
Docker, copy this repository to the Pi, and run the API container from the
repository root:

```sh
cd sentinel-status/backend
docker compose -f docker-compose.pi.yml up -d --build
```

The API will be available on the Pi at `http://<pi-hostname-or-ip>:5283` and
will restart after reboots or process failures. SQLite is stored in a Docker
volume named `sentinelops-data`, so rebuilding the image does not erase monitor
history. Check it with:

```sh
docker compose -f docker-compose.pi.yml ps
docker compose -f docker-compose.pi.yml logs -f sentinelops-api
```

For personal LAN use, run the frontend on your computer with
`VITE_API_BASE_URL=http://<pi-hostname-or-ip>:5283` in `.env`. For a public
portfolio demo, do not port-forward the Pi directly to the internet. Deploy the
frontend through Cloudflare and expose the API through a Cloudflare Tunnel or
Tailscale Funnel, then set `FRONTEND_ORIGINS` to the exact public frontend URL.
Keep the Pi's database and real monitor URLs out of the recording; use the
development portfolio seed locally when you need a repeatable showcase.

### Separate local portfolio environment

You can run a portfolio copy beside the personal service without sharing its
database. In terminal 1, start the demo API on port `5284`:

```sh
docker compose -f backend/docker-compose.demo.yml up -d --build
```

In terminal 2, point the frontend at that demo API:

```sh
cp .env.demo.example .env
npm run dev
```

Then seed only the demo database:

```sh
curl -X POST http://localhost:5284/api/demo/seed
```

Your personal Pi service remains on port `5283` with its separate
`sentinelops-data` volume. The demo service uses `sentinelops-demo-data`, so
resetting or recording the portfolio environment cannot touch your real
monitors. Remove the demo dataset with `curl -X DELETE http://localhost:5284/api/demo/seed`.

### Portfolio demo mode

For a repeatable screen recording, seed a clearly labeled demo dataset while the
API is running in its Development profile:

```sh
curl -X POST http://localhost:5283/api/demo/seed
```

This creates two real monitors tagged `portfolio-demo`: one healthy endpoint and
one predictable failing path. Wait about 45 seconds for three checks, then record
the dashboard, monitor history, incident timeline, acknowledgement, and recovery
workflow. The API continues checking them over SignalR, so the recording shows
the actual live path rather than animated placeholder data.

Remove only the portfolio monitors when finished:

```sh
curl -X DELETE http://localhost:5283/api/demo/seed
```

These endpoints exist only when `ASPNETCORE_ENVIRONMENT=Development`; they are
not available in a deployed production build. For a polished portfolio demo,
record at 1440px and 390px, show the browser Network tab briefly for REST and
WebSocket traffic, and finish on the incident timeline. Keep personal monitors
out of the recording by using the demo reset before capturing it.

## Verification

```sh
npm run build
npm run lint
dotnet test backend/SentinelOps.sln
```

## Resume/project reference

Use the deployed URL and repository link only after you have deployed it and
verified the public demo. A concise resume entry could be:

> **SentinelOps | Full-stack uptime monitoring dashboard** — Built a React/TanStack Start and ASP.NET Core 8 application that performs scheduled HTTP health checks, persists check history and incident state with EF Core/SQLite, and streams live status updates through SignalR. Added responsive operational views for monitor management, incident response, uptime analytics, and status reporting, with automated API and SignalR tests.

Good portfolio evidence to capture:

* A short screen recording showing a successful check, a failing monitor, the resulting incident, and recovery.
* A screenshot of the dashboard with the realtime indicator and event feed visible.
* Links to the README, API tests, `MonitorCheckService`, and the live demo in the project description.
* A brief architecture diagram showing browser -> REST/SignalR -> ASP.NET Core -> SQLite.

## Cloudflare / Nitro deployment prep

The app is already set up to build with the Nitro Cloudflare preset used by TanStack Start.

### Required environment variable

Create a local `.env` file from `.env.example` before running the app against a real deployed API:

```bash
cp .env.example .env
```

Set the deployed backend URL in `.env`:

```bash
VITE_API_BASE_URL=https://api.example.com
```

For local development, the default remains `http://localhost:5283` when the variable is not set.

### Deploy to Cloudflare

```bash
npm run deploy:cloudflare
```

This builds the Nitro output and deploys the generated worker config from `.output/server/wrangler.json`.

### Local Cloudflare preview

```bash
npm run preview:cloudflare
```

### Backend deployment (Cloud Run, free tier)

The ASP.NET Core API + SignalR hub in `backend/SentinelOps.Api` deploys to
Google Cloud Run, with Cloudflare (DNS/proxy) sitting in front of both it and
the frontend. See [`backend/DEPLOY.md`](backend/DEPLOY.md) for the exact
commands.

The sections below retain the original frontend design and responsive behavior
specification. The typed service boundary described there remains useful, but
the ASP.NET Core REST client and SignalR integration are now implemented.

## Visual direction

Dark and light both first-class, following the OS preference with a manual override. Information-dense, minimal, terminal-adjacent: compact rows over big cards, tabular numerals, monospace for IDs/latency/timestamps, thin 1px borders instead of shadows, one accent hue plus a strict status palette (up / degraded / down / paused / unknown).

No gradients, no glass, no decorative motion. Transitions should be limited to state changes, realtime updates, navigation, and sparkline/chart updates.

The interface should feel like a professional engineering tool rather than a marketing website.

## Information architecture

```text

/                     Dashboard — global health

/monitors             Monitors list (filter, search, bulk state)

/monitors/new         Create monitor

/monitors/$id         Monitor detail (overview / checks / incidents / settings)

/monitors/$id/edit    Edit monitor

/incidents            Incidents list (active / resolved)

/incidents/$id        Incident detail — timeline + recovery

/agents               Regions & agents (future phase, read-only)

/status               Public status page preview

/settings             General, notification channels, appearance

```

Primary desktop navigation: persistent left sidebar containing:

* Dashboard

* Monitors

* Incidents

* Agents

* Status page

* Settings

Compact top bar:

* Global search / command palette (`Cmd/Ctrl + K`)

* Environment/time-range control

* Active incident count badge

* Realtime connection status

* Theme toggle

## Responsive and mobile behavior

SentinelOps must be fully responsive across desktop, tablet, and mobile.

Desktop remains the primary engineering workflow and should preserve the information-dense dashboard experience.

Mobile should prioritize incident response and quick health visibility rather than simply shrinking the desktop interface.

### Desktop

* Persistent collapsible sidebar

* Dense tables

* Multi-column dashboard layouts

* Full charts and historical analysis

* Keyboard-oriented workflows

* Command palette

### Tablet

* Sidebar becomes collapsible or drawer-based

* Multi-column layouts reduce where necessary

* Preserve tables when readable

* Allow horizontal scrolling for genuinely tabular data

* Maintain access to filters, sorting, and actions

### Mobile

Replace the persistent sidebar with a navigation drawer or compact mobile navigation.

Prioritize this information hierarchy:

1. Overall system health

2. Active incidents

3. Degraded/down monitors

4. Recent events

5. Individual monitor status

6. Historical analytics

Metric tiles should collapse into either:

* a compact two-column grid, or

* a horizontally scrollable metric strip when more appropriate

Do not simply shrink desktop tables.

For complex tables:

* Show the most important fields in compact rows/cards

* Allow opening an item for complete details

* Preserve filtering/sorting using a mobile filter sheet or menu

* Use horizontal scrolling only when preserving the table relationship is important

Mobile monitor summaries should prioritize:

* Status

* Monitor name

* Uptime

* Current latency

* Last check

Mobile incident summaries should prioritize:

* Severity

* Affected service

* Current state

* Started time

* Duration

Charts must resize cleanly without causing horizontal page overflow.

Forms should become single-column on smaller screens.

Dialogs that become cramped should use mobile sheets or full-screen views.

Touch targets should be appropriately sized.

Critical incident information must never be hidden simply because the viewport is small.

Test responsive layouts at approximately:

* 1440px desktop

* 1024px laptop/tablet

* 768px tablet

* 390px mobile

* 360px small mobile

Responsive behavior should be built into components from the beginning rather than added as a separate mobile phase later.

## Core screens

### Dashboard

A health strip showing:

* Services up

* Degraded services

* Down services

* Active incidents

* 24h availability

* p95 latency

Include:

* Active-incident band that appears only when incidents exist

* Dense monitor grid

* Per-monitor 90-check uptime bars

* Recent-events feed

* Monitoring-agent summary

* Realtime connection state

The dashboard should answer one question immediately:

**Is everything healthy right now?**

### Monitors list

Desktop table columns:

* Status

* Name

* URL

* Region

* Interval

* Last check

* 24h uptime

* p95 latency

* Mini sparkline

* Actions

Actions:

* Pause/resume

* Edit

* Delete

Filtering:

* Status

* Tag

* Region

Sorting:

* Any useful column

Search should work across monitor name, URL, tag, and region.

DataTable should be designed so virtualization can be added later, but virtualization should only be enabled if the mock dataset is large enough to justify the complexity.

### Add/edit monitor

Single-column form containing:

* Name

* URL

* HTTP method

* Expected status codes

* Check interval

* Timeout

* Request headers

* Optional request body

* Regions

* Tags

* Alert channels

* Assertions

Include:

* Inline field validation

* Validation summary when appropriate

* Live "what this checks" summary panel

* Unsaved-change protection

* Clear destructive actions

### Monitor detail

Header:

* Current status

* Uptime SLO

* Last check

* Pause/resume

* Edit

Time range:

* 1h

* 24h

* 7d

* 30d

Include:

* Latency chart

* p50

* p95

* p99

* Uptime timeline

* Check log

* Incident history

* Monitor configuration summary

Check log columns:

* Timestamp

* Region

* Status code

* Latency

* Error

* Result

### Incidents list

Group incidents by:

* Active

* Resolved

Show:

* Severity

* Affected monitor

* Started time

* Duration

* Acknowledged by

* Current state

* Affected regions

### Incident detail

Header states:

* Open

* Acknowledged

* Monitoring

* Resolved

Impact summary:

* Duration

* Failed checks

* Affected regions

* Current recovery state

Timeline events:

* Detected

* Region confirmations

* Acknowledged

* Engineer note

* Recovery detected

* Resolved

Include:

* Recovery status

* Add-note composer

* State-change actions

* Clear indication of whether the incident is still active

### Agents / regions

Read-only table for the future distributed-agent feature.

Fields:

* Name

* Location

* Agent version

* Last heartbeat

* Checks/min

* Health

Clearly label this area as a future-phase preview.

Do not fake operational distributed agents.

### Status page

Public status-page preview showing:

* Overall system state

* Per-service state

* 90-day history

* Active incidents

* Recent resolved incidents

Do not expose private URLs or internal configuration values.

### Settings

Sections:

* General defaults

* Notification-channel placeholders

* Appearance

* Default time range

* Default monitor interval

* Future integration placeholders

Notification channels in this phase should be UI-only mock configuration.

## Reusable components

Create reusable components including:

* StatusDot

* StatusBadge

* UptimeBar

* LatencySparkline

* MetricTile

* TimeRangeSelector

* DataTable

* FilterBar

* SeverityTag

* RelativeTime

* DurationLabel

* TimelineEvent

* EmptyState

* ErrorState

* LoadingSkeleton

* SkeletonRow

* SkeletonChart

* ConfirmDialog

* PageHeader

* SidebarNav

* MobileNav

* CommandPalette

* CodeInline

* RealtimeConnectionIndicator

* ResponsiveDataView

`ResponsiveDataView` may render a table on desktop and compact rows/cards on smaller viewports without duplicating page logic.

## Domain entities

### Monitor

* id

* name

* url

* method

* expectedStatus

* intervalSeconds

* timeoutMs

* headers

* regions

* tags

* enabled

* currentStatus

* createdAt

* updatedAt

### CheckResult

* id

* monitorId

* regionId

* timestamp

* statusCode

* latencyMs

* success

* errorType

* errorMessage

### UptimeWindow

* monitorId

* range

* availability

* p50

* p95

* p99

* buckets[]

### Incident

* id

* monitorId

* severity

* state

* startedAt

* acknowledgedAt

* resolvedAt

* durationSeconds

* affectedRegions

* failedCheckCount

### IncidentEvent

* id

* incidentId

* type

* timestamp

* actor

* message

Supported event types:

* detected

* confirmed

* acknowledged

* note

* recovered

* resolved

### Region / Agent

* id

* name

* location

* agentVersion

* lastHeartbeat

* healthy

### NotificationChannel

* id

* type

* target

* enabled

## Frontend state

### Server state

Use TanStack Query for every read.

Example query keys:

```ts

['monitors']

['monitors', id]

['monitors', id, 'checks', range]

['monitors', id, 'incidents']

['incidents']

['incidents', id]

['agents']

```

Mutations:

* Create monitor

* Edit monitor

* Pause/resume monitor

* Delete monitor

* Acknowledge incident

* Resolve incident

* Add incident note

Use optimistic updates when appropriate, with rollback on failure and targeted query invalidation.

### Realtime seam

Create a `RealtimeProvider`.

Phase 1 behavior:

* Mock event emitter

* Simulated monitor check updates

* Simulated incident-state updates

* Simulated reconnect state

Realtime events should update TanStack Query caches rather than require components to contain special mock logic.

Later, replace the provider implementation with SignalR without changing page components.

### URL state

Store shareable view state in search params:

* Filters

* Sort

* Time range

* Active tab

* Search terms where appropriate

### Local state

Persist:

* Theme preference: system / light / dark

* Sidebar collapsed state

* Optional density preference later

Use localStorage for these preferences.

## Loading, empty, success, and error states

Every data surface must define all four.

### Loading

Use shape-matched skeletons:

* Table rows

* Metric tiles

* Charts

* Timeline events

* Detail panels

Avoid spinners inside dense dashboard views.

### Empty

Differentiate:

**No data yet**

Example: no monitors exist → show create-monitor action.

**No results**

Example: current filters return nothing → show clear-filters action.

**Healthy/all clear**

Example: no active incidents → show positive healthy confirmation, not an error-state appearance.

### Success

Use:

* Inline success feedback

* Toasts for mutations

* Immediate optimistic updates where safe

Avoid excessive celebratory UI.

### Errors

Support:

**Fetch failure**

* Keep stale data visible when available

* Show inline retry action

**Mutation failure**

* Toast

* Roll back optimistic update

**Validation**

* Per-field errors

* Clear explanation

**Realtime disconnect**

* Subtle reconnecting indicator in the top bar

**Unknown route entity**

* Dedicated 404/not-found state for missing monitor or incident IDs

## Technical notes

Use:

* React

* TypeScript

* Vite

* TanStack Router

* TanStack Query

Do not use TanStack Start for server-side application behavior because the intended backend is ASP.NET Core.

Mock API should live under:

```text

src/lib/api/

```

Suggested structure:

```text

src/lib/api/

├── contracts/

├── mock/

├── monitors.ts

├── incidents.ts

├── agents.ts

└── dashboard.ts

```

The mock API should expose asynchronous functions with the same logical signatures the future REST client will use.

The implementation should use:

* Seeded deterministic fixtures

* Simulated latency

* Injectable failures

* Simulated mutation behavior

This allows loading, success, and failure states to be reviewed intentionally.

Components must never import mock fixtures directly.

All reads/writes must pass through the API/service layer.

Fixture data must be clearly recognizable as sample/development data.

Do not fabricate marketing claims or pretend sample metrics represent real production systems.

Charts should use a lightweight chart library and theme-token-driven colors.

When the backend lands, the primary integration changes should be limited to:

* `src/lib/api/`

* `RealtimeProvider`

The page/component layer should not require architectural rewrites.

## Suggested frontend structure

```text

src/

├── app/

├── components/

├── features/

│   ├── dashboard/

│   ├── monitors/

│   ├── incidents/

│   ├── agents/

│   └── status/

├── lib/

│   ├── api/

│   ├── realtime/

│   └── query/

├── models/

├── routes/

├── hooks/

├── styles/

└── utils/

```

Avoid:

* One enormous page component

* Components directly calling fixtures

* Duplicate desktop/mobile page implementations

* Business logic buried inside display components

## Accessibility

Use:

* Semantic HTML

* Keyboard-accessible controls

* Visible focus indicators

* Adequate contrast

* ARIA labels where appropriate

Never use color as the only way to identify:

* Healthy

* Degraded

* Down

* Paused

* Incident severity

Status components should combine:

* Color

* Icon

* Text label

## Phase 1 acceptance criteria

Phase 1 is considered complete when:

* All listed routes render successfully

* All screens use the typed mock API layer

* No page/component imports fixtures directly

* Dashboard, monitors, incidents, agents, status preview, and settings are implemented

* Loading states are demonstrable

* Empty states are demonstrable

* Error states are demonstrable

* Success/mutation states are demonstrable

* Mock realtime events update visible UI without a page refresh

* Realtime reconnect state can be demonstrated

* Filters, sorting, tabs, and time range use URL state where appropriate

* System/light/dark theme selection works

* Theme follows OS preference by default

* Desktop, tablet, and mobile layouts are usable

* There is no unintended horizontal page overflow

* Dense tables adapt appropriately on smaller screens

* No backend service has been created

* No database has been created

* No authentication system has been created

* No Supabase/Firebase integration has been added

* Sample fixture data is clearly identified as development/sample data

* No unsupported claims or fake production behavior are presented as real

## Phasing

### Phase 1

Design tokens, app shell, responsive navigation, typed mock API, deterministic fixtures, realtime mock seam.

### Phase 2

Dashboard, monitors list, monitor detail.

### Phase 3

Add/edit monitor flow.

### Phase 4

Incidents list and incident detail.

### Phase 5

Agents/regions preview, status page preview, settings.

### Phase 6

Frontend architecture review/refactor to ensure every component is ready for real API integration.

### Phase 7

Replace the typed mock API with ASP.NET Core REST APIs and replace the mock `RealtimeProvider` with SignalR.

Do not begin Phase 7 until the frontend UX, responsive behavior, service interfaces, and domain models are stable.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/acd0bd95-05a6-4855-be0b-213cbfa9bbb4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
