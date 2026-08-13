# Sentinel Status

# SentinelOps — Frontend Plan (Phase 1, no backend)

A developer-focused uptime monitoring and incident management UI. This phase builds the complete frontend against a typed mock API layer designed to be swapped for the ASP.NET Core API + SignalR later.

## Phase 1 guardrails

This phase is frontend-only.

Do **not** create or connect:

* Supabase

* Firebase

* Authentication providers

* Databases

* Edge functions

* Serverless functions

* External backend services

* Fake production APIs

All data must come from the typed mock API layer.

Components must never import fixture data directly. Every read and mutation must go through the mock API/service layer so the future ASP.NET Core client can replace it without requiring page-component rewrites.

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
