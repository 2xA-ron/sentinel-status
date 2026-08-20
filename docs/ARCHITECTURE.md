# SentinelOps Architecture

A self-hosted infrastructure monitoring + incident response platform.

Think:

**Uptime Kuma + Datadog + PagerDuty + lightweight Sentry**

but built for developers, homelabs, and small teams.

And the important part:

**You would actually use it yourself.**

It could monitor your servers, Docker containers, APIs, Raspberry Pis, databases, certificates, websites, and applications.

## The problem

Developers running applications often have services scattered everywhere:

```
Server
├── Docker containers
├── APIs
├── PostgreSQL
├── Redis
├── Tailscale
├── Cloudflare Tunnel
├── Raspberry Pi
└── Web applications
```

When something dies, you usually discover it because something suddenly doesn't work.

**SentinelOps answers:**

* What is running?
* What went down?
* When did it go down?
* Why did it go down?
* Is the server overloaded?
* Did a Docker container crash?
* Is my API returning errors?
* Is my SSL certificate expiring?
* Did CPU/RAM spike?
* Has this happened before?

## Architecture

```
                         ┌──────────────────────┐
                         │    Android App       │
                         │ Kotlin / Compose     │
                         │                      │
                         │ Alerts               │
                         │ Incident Management  │
                         │ System Health        │
                         └──────────┬───────────┘
                                    │
                              HTTPS / SignalR
                                    │
                                    ▼
┌─────────────────┐       ┌──────────────────────┐
│ Sentinel Agent  │──────▶│   ASP.NET Core API   │
│                 │       │                      │
│ .NET Worker     │       │ Authentication       │
│ Service         │       │ Monitoring Engine    │
│                 │       │ Alert Engine         │
│ CPU             │       │ Incident Engine      │
│ RAM             │       │ Background Workers   │
│ Disk            │       └──────────┬───────────┘
│ Docker          │                  │
│ Processes       │          ┌───────┴────────┐
│ Services        │          │                │
└─────────────────┘          ▼                ▼
                        PostgreSQL          Redis
                             │
                             │
                             ▼
                  ┌────────────────────┐
                  │ Blazor Dashboard   │
                  │                    │
                  │ Radzen             │
                  │ Real-time Metrics  │
                  │ Logs               │
                  │ Incidents          │
```

## What your agent would monitor

Install a small C# .NET Worker Service on a computer.

```
sentinel-agent install
```

It connects to your server and reports:

```json
{
    "hostname": "odysseus",
    "cpuUsage": 22.7,
    "memoryUsage": 61.4,
    "diskUsage": 48.9,
    "uptime": 912332,
    "containers": 12,
    "containersRunning": 11
}
```

Every machine gets registered with SentinelOps.
## Dashboard

```
SentinelOps
────────────────────────────────────────────────

SYSTEM HEALTH

● Odysseus                     HEALTHY
● Raspberry Pi 5               HEALTHY
● API Server                   DEGRADED
● PostgreSQL                   HEALTHY

────────────────────────────────────────────────

CPU
███░░░░░░░ 27%

MEMORY
██████░░░░ 61%

DISK
████░░░░░░ 43%

────────────────────────────────────────────────

ACTIVE INCIDENTS

⚠ API latency > 800ms
  Started 4 minutes ago

🔴 container: recommendation-api
   Restarted unexpectedly
────────────────────────────────────────────────
```

## Real-time updates

```
ASP.NET Core
     │
     ▼
SignalR
     │
     ├──────────── Web Dashboard
     │
     └──────────── Android
```

Server metrics appear immediately without polling every few seconds.

## Monitoring rules

```
IF CPU > 90%
FOR 5 minutes
THEN create incident
```

```
IF HTTP /health != 200
THEN critical alert
```

```
IF certificate expires < 14 days
THEN warning
```

```
IF Docker container exits unexpectedly
THEN critical alert
```

## Incident management

```
INC-1042

Service:          recommendation-api
Severity:         CRITICAL
Started:          11:42 PM
Cause:            Container exited with code 137

System Metrics:
  CPU: 34%
  RAM: 94%
## Android companion app

Instead of another Flutter project, build this using:

**Kotlin + Jetpack Compose**

Google currently recommends Jetpack Compose as Android's modern UI toolkit.

Your skills would expand from:

* Flutter / Dart

to:

* Flutter / Dart
* Kotlin
* Jetpack Compose
* Native Android

### Android app

```
┌──────────────────────────┐
│ SentinelOps              │
│                          │
│ Infrastructure           │
│                          │
│ ● Odysseus       Healthy │
│ ● Raspberry Pi   Healthy │
│ ⚠ API Server     Warning │
│ ● Database       Healthy │
│                          │
│ ──────────────────────── │
│                          │
│ Active Incidents      2  │
│                          │
│ 🔴 API unavailable       │
│    3 minutes ago         │
│                          │
│ ⚠ Memory > 90%           │
│    11 minutes ago        │
└──────────────────────────┘
```

You receive Android notifications when infrastructure goes down.

### Offline-first Android

Store incidents locally using:

**Room**

Then use:

**WorkManager**

for synchronization.

Google's Android architecture guidance explicitly describes Room + WorkManager as a pattern for offline queues and synchronization.

You could therefore demonstrate:

* Repository pattern
* Room database
* WorkManager
* Offline synchronization
* Conflict resolution
* Coroutines
* Flow
* Jetpack Compose
* REST APIs

## Authentication / security

* ASP.NET Identity
* JWT / refresh tokens
* RBAC
* Device registration
* API keys for monitoring agents
* Encrypted secrets
* Rate limiting
* Audit logging

### Roles

* Administrator
* Operator
* Viewer
* Agent

## Database

Use **PostgreSQL** instead of SQL Server — for resume expansion.

### Schema

```
Users
Organizations
Machines
Agents
Services
Metrics
MetricSamples
HealthChecks
AlertRules
Alerts
Incidents
IncidentEvents
Notifications
ApiKeys
AuditEvents
```

* SQL Server
* PostgreSQL
* Redis

### Redis

* Metric caching
* Rate limiting
* Distributed locks
* Real-time state
* Job queues

## Observability

Use **OpenTelemetry**.

* API requests
* Database calls
* Background jobs
* Agent communications
* Notification delivery

* Traces
* Metrics
* Logs

* Distributed tracing
* Structured logging
* Correlation IDs
* Latency percentiles
* Service-level indicators

## CI/CD

```yaml
.github/
    workflows/
        build.yml
        test.yml
        docker.yml
        security-scan.yml
```

```
git push
   ↓
GitHub Actions
   ↓
Restore
   ↓
Build
   ↓
Unit Tests
   ↓
Integration Tests
   ↓
Security Scan
   ↓
Docker Build
   ↓
Container Registry
   ↓
Deploy
```

## Docker

```
git clone sentinelops

docker compose up -d
```

```yaml
services:
  sentinel-api:
  sentinel-web:
  sentinel-worker:
  postgres:
  redis:
  prometheus:
```

## AI feature

**One feature.**

### Incident Analysis

```
11:32 API latency 231ms
11:34 API latency 422ms
11:36 Memory 82%
11:38 Memory 91%
11:39 API latency 1800ms
11:41 container OOM
11:42 container restarted
```

via **Ollama**:

```
Probable Cause

The recommendation-api appears to have experienced
progressive memory exhaustion.

Evidence:
• Memory increased from 82% → 91%
• API latency increased concurrently
• Container terminated with an OOM condition
• Container recovered following restart

Recommended investigation:
Inspect memory allocations occurring between 11:32–11:41.
```

## What this project teaches

| Area | Technology |
|---|---|
| Backend | C#, ASP.NET Core |
| API | REST |
| Realtime | SignalR |
| Web | Blazor / Radzen |
| Android | Kotlin |
| Android UI | Jetpack Compose |
| Local DB | Room |
| Async | Coroutines / Flow |
| Database | PostgreSQL |
| Cache | Redis |
| Containers | Docker |
| CI/CD | GitHub Actions |
| Monitoring | OpenTelemetry |
| Security | JWT / OAuth / RBAC |
| Networking | Cloudflare / Tailscale |
| Testing | xUnit / integration testing |
| AI | Ollama / LLM integration |
| Architecture | Clean Architecture |
| Deployment | Linux |
| Background Processing | .NET Worker Services |


Related Events:
  11:39 RAM exceeded 90%
  11:40 RAM exceeded 93%
  11:42 Container terminated

Status:           Investigating
Assigned:         Aaron
```

