# PingOmni Monitor user guide

Everything PingOmni Monitor does, for the people who use it, with an example for each feature. Page names are as
they appear in the app's left panel: **Page → part of the page**.

The examples use a made-up company, *Example ISP*, with the website `www.example.com`, the API
`api.example.com`, the mail server `mail.example.com` and the router `203.0.113.1`. Replace them with your own.

## Contents

1. [What PingOmni Monitor does](#1-what-pingomni-monitor-does)
2. [Getting started](#2-getting-started)
3. [Plans and limits](#3-plans-and-limits)
4. [Who can do what](#4-who-can-do-what)
5. [Overview](#5-overview)
6. [Monitors: the settings every check has](#6-monitors-the-settings-every-check-has)
7. [Check types, with examples](#7-check-types-with-examples)
8. [When a monitor is called down](#8-when-a-monitor-is-called-down)
9. [Working with many monitors](#9-working-with-many-monitors)
10. [Incidents](#10-incidents)
11. [Alerts](#11-alerts)
12. [Status pages](#12-status-pages)
13. [Maintenance](#13-maintenance)
14. [Reports](#14-reports)
15. [Team](#15-team)
16. [Settings](#16-settings)
17. [The API](#17-the-api)
18. [AI assistants (MCP)](#18-ai-assistants-mcp)
19. [Good to know](#19-good-to-know)

---

## 1. What PingOmni Monitor does

PingOmni Monitor checks your services from the outside, the way your customers reach them. It tells you when
something is down, slow or about to expire, and it can show your customers the state of your services.

- **Monitors** check websites, APIs, certificates, routers, ports, DNS records, mail servers, WebSockets,
  databases and domain registrations. They also watch for the scheduled jobs that should report in
  (heartbeats).
- **Incidents** record every outage: when it started, why, who acknowledged it, and what was said.
- **Alerts** reach you by email, Slack, Microsoft Teams, Google Chat, Discord, Telegram, PagerDuty or a
  webhook.
- **Status pages** are public pages in seven languages. They can have email subscribers, run on your own
  domain, and come with a badge and a widget for your website.
- **Maintenance** windows keep planned work from opening incidents and alerting anyone.
- **Reports, the API and the MCP connector** let you get the numbers out, automate the work, and ask an AI
  assistant.

Checks run from PingOmni's probes in more than one network. A monitor is called down only when other
networks confirm it (section 8), so a problem on our side never wakes you up.

## 2. Getting started

PingOmni Monitor signs you in with your **PingOmni Account** (account.pingomni.com). The same account holds
your plan and its invoices.

**Example: from nothing to the first alert in five minutes**

1. Go to **mon.pingomni.com** and choose **Sign in**. Sign in with your PingOmni Account, or create one.
2. If the account has no plan yet, the app offers **Get the Free plan**. It costs nothing and starts at once.
3. You land on **Overview** in your workspace. A *company* workspace is named after the company; a
   *personal* workspace is named after you.
4. Choose **Add a monitor** → **Website**. Enter:
   - Address: `https://www.example.com/`
   - Name: `Main website`
   - Tick **Also watch its SSL certificate and domain registration**.
5. Choose **Add**. Three monitors appear: the website, its certificate and the `example.com` registration.
   Their first check runs within a minute.
6. Open **Alerts** → **Add a channel** → **Email**. Enter `noc@example.com` and choose **Send a test**.

From now on, if `www.example.com` stops answering, `noc@example.com` gets an email such as *"Down: Main
website (https://www.example.com/) is down: Connection timed out"*. When it is back up, an email follows:
*"Recovered: Main website is back up after 4 minutes."*

To move between PingOmni Monitor and your licences and invoices, use **Open PingOmni Account** at the foot of
the left panel.

## 3. Plans and limits

The plan comes from your PingOmni Account. To buy or change it, go to **Settings → Plan and billing →
Manage the plan**. A change applies here within minutes.

| | Free | Starter | Pro | Business |
|---|---|---|---|---|
| Monitors | 10 | 25 | 100 | 500 |
| Fastest check | every 5 min | every 1 min | every 30 s | every 30 s |
| Status pages | 1 | 2 | 10 | 50 |
| People in the workspace | 1 | 3 | 10 | 50 |
| Alert channels | 2 | 5 | 20 | 100 |
| Check history kept | 7 days | 30 days | 90 days | 180 days |
| Status page subscribers | – | 100 | 1,000 | 10,000 |
| Status page on your own domain | – | – | yes | yes |

**Example:** you are on Starter, so the fastest check is every minute. A monitor set to every 30 seconds is
refused with *"Your plan checks at most every 1 min."* If you move down from Pro to Starter, monitors set
faster than the new plan allows slow down to its fastest interval by themselves. Monitors above the new limit
stop being checked until you remove some or upgrade.

When a plan is ordered but not yet paid, a notice says so at the top of every page. The workspace stays on its
current plan until the invoice is paid.

## 4. Who can do what

Everyone in a workspace has a **role**:

| Role | Can |
|---|---|
| viewer | see everything; change nothing |
| member | add, change and pause monitors; acknowledge incidents and write notes; plan maintenance |
| admin | as member, plus alert channels, status pages, the team and API keys |
| owner | everything, including the workspace's name, type and time zone, and its billing |

**Example:** your on-call engineer should acknowledge incidents and pause a monitor during repairs, but should not
change where alerts go. Invite them as **member**. Give your customer-support colleague **viewer**: they can
see what is down when a customer calls.

## 5. Overview

The first page is a summary of what you need to know now:

- **The state in one line**, such as *"1 monitor down, 1 degraded"* or *"All 10 monitors up"*. Open it to see
  which monitors it means.
- **Today**: checks run, outages, and the next certificate to expire.
- **Uptime, 30 days**, as a ring, with each monitor's state as a bar.
- **Average response** and **open incidents**, including the longest open one.
- **Response time, last 24 hours** for your websites, and the **latest checks** as they arrive.

The page updates itself every 30 seconds while it is open (*Live · updated just now*).

The bell at the top right lists what needs someone: monitors down, a plan waiting for payment, or no alert
channel yet. **Clear** hides an item for you; a new problem rings again.

## 6. Monitors: the settings every check has

**Monitors → Add a monitor** first asks for the type (section 7), then shows these settings for every type:

| Setting | What it does | Example |
|---|---|---|
| Name | How it shows in lists, alerts and status pages | `Main website` |
| Tags | Groups for filtering and changing many at once, separated by commas (at most 10) | `client a, web` |
| Check every | 30 s, 1, 2, 5, 10, 15 or 30 min, 1 h, 6 h or 24 h (no faster than your plan) | `1 min` |
| Send alerts for this monitor | Off: outages are recorded, but nobody is told | on |
| Alert | Wait before alerting: at once, or after 1, 2, 5, 10, 15, 30 or 60 minutes down | `after 5 minutes` |
| Slow above (ms) | Slower answers mark it **degraded** (websites, ping, mail, WebSocket, database) | `1500` |
| Slow for | How long it must stay slow before that counts: 2 to 60 minutes | `5 minutes` |

**Example: a shop that sometimes blips.** `shop.example.com` has a load balancer that drops a check now and
then. Set **Alert: after 5 minutes**. Each outage is still recorded and counts against uptime, but only one
that lasts 5 minutes alerts anyone.

**Example: slow is a problem too.** Your API should answer within 800 ms. Set **Slow above: 800** and **Slow
for: 10 minutes**. A short slow spell is ignored. If it stays slower than 800 ms for 10 minutes, the monitor
turns **degraded** and you get a *"Warning: API"* alert.

A monitor's page shows its current state and uptime (24 hours, 7 and 30 days). It also shows the response
time chart, how the time was spent (DNS, connect, TLS, first byte), the last checks and its incidents. The
buttons there are:

- **Check now** runs the check at once and shows the result. This is useful after a fix.
- **Pause** stops the checks: no outages are recorded and nothing alerts. **Resume** starts them again.
- **Edit** changes the settings. The type cannot change; add a new monitor instead.

## 7. Check types, with examples

### Website (HTTP and HTTPS)

Requests an address and checks the answer's status code.

| Setting | Default | Notes |
|---|---|---|
| Address (URL) | – | Starts with `https://` or `http://` |
| Method | GET | GET, HEAD or POST |
| Expected status | `200-399` | Codes and ranges, separated by commas: `200`, `2xx`, `200-299, 301` |
| Time-out | 15 s | 2 to 30 seconds |
| Follow redirects | on | Off: a redirect is the answer, so expect `301` or `302` |
| Fail on an invalid certificate | on | Off for a test server with a self-signed certificate |

**Example: a health endpoint.** Address `https://api.example.com/health`, method `GET`, expected status
`200`. The monitor is down on a 500, on a time-out and on an invalid certificate.

**Example: a redirect that must stay.** `http://example.com` should send visitors to HTTPS. Address
`http://example.com/`, **Follow redirects** off, expected status `301`. If someone removes the redirect and the
page answers `200`, you hear about it.

### Website: check a field in a JSON answer

Any website monitor can also check one field of a JSON answer. Open **Check a field in the JSON answer**:

| Setting | Example | Means |
|---|---|---|
| Field | `status` | the top-level field `status` |
| Field | `data.items[0].state` | `state` of the first item in `data.items` |
| Rule | is, is not, contains, is less than, is more than, exists, is missing | |
| Value | `ok`, `500`, `true`, `null` | text, a number, true, false or null; case does not matter |

**Example: the database behind the API.** `https://api.example.com/health` answers:

```json
{ "status": "ok", "checks": [ { "name": "db", "healthy": true, "latency_ms": 12 } ], "queue": { "waiting": 40 } }
```

| Field | Rule | Value | Down when |
|---|---|---|---|
| `status` | is | `ok` | the API says anything but `ok` |
| `checks[0].healthy` | is | `true` | the database check fails |
| `queue.waiting` | is less than | `500` | 500 or more jobs are waiting |
| `error` | is missing | | an `error` field appears |

One rule per monitor. To check two fields, add the same address twice with different rules.

### Keyword

Like Website, but the page must also contain (or must not contain) a word or phrase. Case does not matter.

**Example: the page is up but broken.** The shop answers `200` with an empty page when its database is down.
Address `https://shop.example.com/`, keyword `Add to cart`, **The page must: contain it**.

**Example: an error page with status 200.** Keyword `Fatal error`, **The page must: not contain it**.

### SSL certificate

Watches a certificate's expiry and validity: the chain, the name, and whether it has expired.

| Setting | Default |
|---|---|
| Host | – (`www.example.com`, without `https://`) |
| Port | 443 |
| Warn before it ends | 14 days |

**Example:** host `www.example.com`, warn `21` days. Three weeks before the certificate ends, the monitor turns
**degraded** with *"Expires in 21 days (Let's Encrypt R11)"* and alerts. If renewal is automatic and works,
you never see it. If renewal is broken, you have three weeks to fix it.

Certificates on other ports work too: host `mail.example.com`, port `993` checks the IMAP certificate.

### Ping

Sends ICMP pings to a host or IP address. It is down when none come back.

**Example: the core router.** Host `203.0.113.1`, name `Core router`, slow above `50` ms for `5 minutes`. A
congested uplink shows as **degraded** before customers call.

Some hosts do not answer pings (their firewall drops ICMP). For those, use a **TCP port** check.

### TCP port

Opens a TCP connection to a port. It is up when the connection is accepted.

| Example | Host | Port |
|---|---|---|
| SSH on a server | `server1.example.com` | 22 |
| RADIUS accounting proxy | `radius.example.com` | 1813 |
| RDP | `office.example.com` | 3389 |
| A game or VoIP server | `voip.example.com` | 5060 |

The check only opens the connection; it sends no data.

### DNS record

Looks up a record and, optionally, checks its value.

| Setting | Notes |
|---|---|
| Host | the name to look up: `example.com`, `www.example.com` |
| Record | A, AAAA, CNAME, MX, NS or TXT |
| Expected value | down when no answer contains it; empty: the record only has to exist |

**Example: the website's address must not change.** Host `www.example.com`, record `A`, expected
`198.51.100.10`. If someone repoints the name, or the domain is hijacked, you know within one check.

**Example: mail must reach the right server.** Host `example.com`, record `MX`, expected `mail.example.com`.

**Example: domain verification stays in place.** Host `example.com`, record `TXT`, expected
`google-site-verification=`.

### Mail server (SMTP)

Connects to a mail server, reads its greeting, says `EHLO`, and starts TLS. It sends no mail.

| Setting | Default | Notes |
|---|---|---|
| Host | – | `mail.example.com` |
| Port | 25 | 587 for submission, 465 for TLS from the start |
| Encryption | auto | auto (TLS when offered), require (down without TLS), off |
| Fail on an invalid certificate | on | |
| Warn before its certificate ends | 14 days | |
| Time-out | 15 s | |

**Example:** host `mail.example.com`, port `25`, encryption **require**. The monitor is down when the server
stops answering, refuses connections, stops offering STARTTLS, or presents an expired certificate.

### WebSocket

Opens a WebSocket. Optionally, it sends a message and checks the first answer.

| Setting | Example |
|---|---|
| Address (URL) | `wss://ws.example.com/live` |
| Send a message | `{"type":"ping"}` |
| The answer contains | `pong` |
| Subprotocol | `graphql-ws` |

**Example: a live-chat backend.** Address `wss://chat.example.com/socket`, send `{"type":"ping"}`, the answer
contains `pong`. It is down when the socket does not open, or when the first message back has no `pong`.

### Database

Checks that a database server answers its own protocol: MySQL or MariaDB, PostgreSQL, Redis or MongoDB. It
needs no password: it reads the server's handshake and signs in to nothing.

| Database | Default port |
|---|---|
| MySQL / MariaDB | 3306 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| MongoDB | 27017 |

**Example:** database **PostgreSQL**, host `db.example.com`. It is up when the server answers as PostgreSQL;
the details show its version. Tick **The server only takes TLS connections** if it requires TLS.

The server must be reachable from PingOmni's probes. A database that only listens inside your network cannot
be checked from outside; for it, use a **heartbeat** from a job inside your network (below).

### Domain

Watches a domain's registration (RDAP and WHOIS): when it expires, and whether it is still registered.

**Example:** domain `example.com`, warn `30` days. A month before the registration ends, it turns **degraded**
and alerts, so a forgotten renewal or an expired card never takes your domain down. Domains are checked at
most every 6 hours, whatever the interval.

### Heartbeat (scheduled jobs)

The other checks call your services. A heartbeat waits for **your job to call PingOmni**. If no call arrives in
time, the monitor is down. Use it for backups, cron jobs, imports, and anything inside your network.

| Setting | Notes |
|---|---|
| The job runs every | how often the call should arrive |
| Grace time (seconds) | extra time before a call counts as missed; empty means a fifth of the interval, at least 60 s |

After you save, the monitor's page shows its address, such as
`https://mon.pingomni.com/hb/Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56`. Any `GET`, `POST` or `HEAD` request to that
address counts as a call. If the address leaked (say, someone who knew it left the team), make a new one on the same page. The old one
stops working at once.

**Example: the nightly backup.** The backup runs at 02:00 and takes up to an hour. Set **The job runs every:
24 h** and **Grace time: 3600**. Call the address only when the backup succeeded:

```bash
# crontab -e
0 2 * * * /usr/local/bin/backup.sh && curl -fsS -m 10 --retry 3 https://mon.pingomni.com/hb/Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56 > /dev/null
```

If `backup.sh` fails, there is no call. At about 03:00 the next day (24 h plus one hour of grace), the monitor
is down: *"No call since 1 day ago."* The first call after that brings it back up at once.

**Example: a systemd timer.**

```ini
# /etc/systemd/system/import.service
[Service]
Type=oneshot
ExecStart=/opt/import/run.sh
ExecStartPost=/usr/bin/curl -fsS -m 10 https://mon.pingomni.com/hb/Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56
```

`ExecStartPost` only runs when `ExecStart` succeeded.

**Example: Windows Task Scheduler (PowerShell).**

```powershell
& C:\jobs\export.ps1
if ($?) { Invoke-RestMethod -Method Post -Uri "https://mon.pingomni.com/hb/Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56" }
```

**Example: from code.**

```python
import requests
run_report()
requests.get("https://mon.pingomni.com/hb/Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56", timeout=10)
```

**Example: a database inside your network.** On a server next to the database, run every 5 minutes:

```bash
*/5 * * * * pg_isready -h 10.0.0.5 -q && curl -fsS -m 10 https://mon.pingomni.com/hb/Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56 > /dev/null
```

## 8. When a monitor is called down

A monitor is **up**, **degraded** (it works, but is slow, about to expire, or blocks our checks), **down**, or
**paused**. A new monitor is **waiting** until its first check.

Before a monitor is called down, two things happen:

1. **It fails twice in a row.** One failed check only says *"Failed (…), checking again to confirm."*
2. **Other networks are asked.** PingOmni's other probes, and if needed independent probes in Europe and North
   America, run the same check. If most of them reach your service, the problem is on the way between one
   probe and you, not your service. Then nothing is recorded and nobody is alerted. If they fail too, the
   outage is confirmed and the message says so: *"Connection timed out. Confirmed from 3 of 3 other networks."*

**Example timeline: a real outage**

| Time | What happens |
|---|---|
| 10:00:00 | Check: time-out. The monitor says *checking again to confirm* |
| 10:01:00 | Check: time-out again. Other networks also time out |
| 10:01:05 | The monitor is **down**. Incident #57 opens. Alerts go out, or wait as the monitor's **Alert** setting says |
| 10:14:00 | Check: 200 OK. The monitor is **up**. The incident closes after 13 minutes and the *Recovered* alerts go out |

**Example: blocked by the site's firewall.** A site answers everyone except PingOmni (a firewall or a
Cloudflare challenge). After several confirmations, the monitor turns **degraded** rather than down: *"Reachable
from 3 of 3 other networks, but not from PingOmni Monitor. Its firewall may block our checks."* To let the
checks through, see **mon.pingomni.com/bot**. It explains what the checks are and how to allow them. Checks
send the User-Agent `PingOmniMonitor/1.0 (+https://mon.pingomni.com/bot)`.

The second opinion is used only when nothing answered. A site that answers with an error, or without its
keyword, is down for everyone, and is called down at once.

## 9. Working with many monitors

**Monitors** lists everything as a **Board** (cards) or a **List**. You can search by name or address, and
filter by type, status and tag.

**Changing many at once:** choose **Select**, tick monitors (or **Select all shown**, after filtering), then
choose **Pause**, **Resume**, **Alerts off**, **Alerts on**, **Add tag** or **Remove tag** (type the tag
first), or **Remove**.

**Example: a customer's maintenance night.** All of *Client A*'s monitors are tagged `client a`. Filter by the
tag `client a`, choose **Select** → **Select all shown**, then **Alerts off**. Next morning, **Alerts on**. (For planned work, a
maintenance window, section 13, does this by itself.)

**Import and export (CSV).** **Export CSV** downloads every monitor. **Import CSV** adds many at once. The
first line names the columns: `name`, `type` and `target` are needed; `port`, `interval` (in seconds), `tags`,
`keyword`, `record` and `engine` are optional. The columns may be in any order, and a file holds at most 500
monitors. **Download an example file** gives a ready-made one.

```csv
name,type,target,port,interval,tags,keyword,record,engine
Main website,http,https://www.example.com/,,60,web,,,
Shop,keyword,https://shop.example.com/,,60,web,Add to cart,,
Core router,ping,203.0.113.1,,60,network,,,
SSH server1,port,server1.example.com,22,300,servers,,,
Mail,smtp,mail.example.com,25,300,mail,,,
MX record,dns,example.com,,3600,dns,,MX,
Orders DB,database,db.example.com,,300,servers,,,postgres
example.com registration,domain,example.com,,86400,dns,,,
```

The import says how many monitors it added, and lists each line it skipped and why: a setting that is not
valid, a target that is already watched (*"Already watched: a ping monitor for this target exists."*), or the
plan's monitor limit. Their first checks run within a few minutes.

## 10. Incidents

Every outage and every degraded spell is an **incident**: when it started and ended, the cause, and its
timeline.

On an incident's page you can:

- **Acknowledge**: *"I am on it."* The team sees who took it. It also stops escalation (section 11): channels
  set to wait are not alerted.
- **Add a team note**: notes are only for your workspace, such as *"Hosting provider ticket #4411 opened."*
- **Post a public update**: it shows on every status page that shows this monitor, and is emailed to the
  page's subscribers.

**Example: handling an outage**

1. 10:01: alert *"Down: Main website"*. Ana opens the incident and chooses **Acknowledge**.
2. 10:03: Ana adds a team note: *"Upstream 502s, load balancer health checks failing on web2."*
3. 10:05: Ana posts a public update: *"We are investigating problems loading our website."* Subscribers get
   it by email.
4. 10:14: the website is up and the incident closes by itself. Ana posts: *"Fixed: a web server was taken out
   of service. Everything works normally."*

**Incidents** lists them all. Filter **Open** to see what is going on now.

## 11. Alerts

**Alerts → Add a channel** sets where alerts go. Each channel gets every monitor's alerts (unless a monitor has
alerts off). **Send a test** checks a channel at once; the channel shows its last delivery and its last error.

| Channel | What you enter | Example |
|---|---|---|
| Email | addresses, separated by commas | `noc@example.com, ana@example.com` |
| Slack | an incoming webhook address | `https://hooks.slack.com/services/T000/B000/XXXX` |
| Microsoft Teams | a channel workflow's address: the channel → ⋯ → **Workflows** → *Post to a channel when a webhook request is received* | `https://prod-00.westeurope.logic.azure.com/workflows/…` |
| Google Chat | a space's webhook address | `https://chat.googleapis.com/v1/spaces/AAAA/messages?key=…` |
| Discord | a channel webhook address | `https://discord.com/api/webhooks/123/abc` |
| Telegram | a bot token and a chat id | `123456789:AAH…` and `-1001234567890` |
| PagerDuty | an Events API v2 integration key (32 characters) | `0123456789abcdef0123456789abcdef` |
| Webhook | any address, and an optional secret | `https://ops.example.com/hooks/pingomni` |

Each channel has two more settings:

- **Also send when a monitor recovers**: off sends problems only, with no *"Recovered"* messages.
- **When**: **Alert at once**, or **Unacknowledged after** 5, 10, 15 or 30 minutes or 1 hour. Use this to
  escalate. A channel that waited and was alerted also hears of the recovery.

**Example: escalation.** Make three channels:

1. **Email** to the on-call engineer: **Alert at once**.
2. **Telegram** to the team group: **Unacknowledged after 10 min**.
3. **PagerDuty** for the manager's phone: **Unacknowledged after 30 min**.

A short outage at night reaches only the engineer. If they are asleep and nobody acknowledges, the group knows
after 10 minutes and the manager's phone rings after 30.

**Example: Telegram.**

1. In Telegram, talk to **@BotFather**, send `/newbot`, and copy the token, such as `123456789:AAH…`.
2. Add the bot to your team's group and send one message there.
3. Open `https://api.telegram.org/bot<token>/getUpdates` in a browser. The group's `chat":{"id":-100…` is the
   chat id.
4. Enter both in **Alerts → Telegram** and choose **Send a test**.

**Example: a webhook to your own system.** Each alert is a `POST` with this JSON:

```json
{
  "event": "incident.opened",
  "title": "Down: Main website",
  "text": "Main website (https://www.example.com/) is down: Connection timed out",
  "url": "https://mon.pingomni.com/incidents/57",
  "monitor": { "id": 12, "name": "Main website", "type": "http", "target": "https://www.example.com/", "status": "down" },
  "incident": { "id": 57, "kind": "down", "cause": "Connection timed out", "started_at": "2026-10-30T10:01:05+00:00", "resolved_at": null }
}
```

`event` is `incident.opened`, `incident.resolved` or `test`. For a degraded monitor, `incident.kind` is
`degraded`.

With a secret, each request carries `X-PingOmni-Signature: sha256=<HMAC-SHA256 of the body with the secret>`.
Check it before you trust the request:

```js
// Node.js (Express)
import crypto from 'node:crypto';
app.post('/hooks/pingomni', express.raw({ type: 'application/json' }), (req, res) => {
  const want = 'sha256=' + crypto.createHmac('sha256', process.env.PINGOMNI_SECRET).update(req.body).digest('hex');
  const got = req.get('X-PingOmni-Signature') || '';
  if (got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) return res.sendStatus(401);
  const alert = JSON.parse(req.body);
  console.log(alert.title);
  res.sendStatus(204);
});
```

```php
// PHP
$body = file_get_contents('php://input');
$want = 'sha256=' . hash_hmac('sha256', $body, getenv('PINGOMNI_SECRET'));
if (! hash_equals($want, $_SERVER['HTTP_X_PINGOMNI_SIGNATURE'] ?? '')) { http_response_code(401); exit; }
$alert = json_decode($body, true);
```

```python
# Python (Flask)
import hmac, hashlib, os
@app.post("/hooks/pingomni")
def pingomni():
    want = "sha256=" + hmac.new(os.environ["PINGOMNI_SECRET"].encode(), request.get_data(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(want, request.headers.get("X-PingOmni-Signature", "")):
        abort(401)
    alert = request.get_json()
    return "", 204
```

## 12. Status pages

**Status pages → New status page** makes a public page that shows the state of the monitors you choose. It
shows them by their names, never their addresses.

| Setting | Notes | Example |
|---|---|---|
| Title | shown at the top | `Example ISP status` |
| Address | `mon.pingomni.com/s/<address>` | `example-isp` |
| Description | a line under the title | `Internet, mail and hosting` |
| Language | English, Shqip, Italiano, Deutsch, Français, Español, Ελληνικά | `Shqip` |
| Monitors | which monitors it shows, in order (up to 100) | Main website, Mail, Core router |
| Show response times | adds the response time chart | on |
| Subscriptions | visitors can subscribe by email (Starter and above) | on |
| Published | off: the page is hidden, and its address answers *not found* | on |
| Domain | your own domain (Pro and Business) | `status.example.com` |

The page shows the overall state (*"All systems operational"*, *"Some services are slow or partly working"*,
*"Some services are down"*), each monitor's state with 90 days of uptime, and the incidents of the last 14
days with their public updates.

**Languages.** The page shows in its language. A visitor can switch at the foot of the page, or you can link to
another language with `?lang=`: `https://mon.pingomni.com/s/example-isp?lang=de`. Subscribers get their emails
in the language they subscribed in.

**Subscribers.** A visitor enters their email and confirms it from the email they get. After that, they get your
public updates, and an email when an incident opens or is resolved. Every email has an unsubscribe link.
**Status pages → Subscribers** lists them; you can remove anyone.

**Example: your own domain.**

1. Edit the page and enter the domain `status.example.com`.
2. At your DNS provider, add the record:
   ```
   status.example.com.  3600  IN  CNAME  domains.pingomni.com.
   ```
3. Choose **Check now**. Once the record is seen, HTTPS starts by itself a few minutes later, and the page
   opens at `https://status.example.com`.

**A badge for a website or a README.**

```html
<a href="https://mon.pingomni.com/s/example-isp"><img src="https://mon.pingomni.com/s/example-isp/badge.svg" alt="Status"></a>
<img src="https://mon.pingomni.com/s/example-isp/badge.svg?type=uptime" alt="Uptime, 30 days">
```

The first badge shows *status: operational*; the second shows *uptime: 99.98%* over 30 days.

```markdown
[![Status](https://mon.pingomni.com/s/example-isp/badge.svg)](https://mon.pingomni.com/s/example-isp)
```

**A widget for your website.** One line shows a small link with the current state, such as *"All systems
operational"*, and names the affected services when something is wrong:

```html
<script src="https://mon.pingomni.com/s/example-isp/widget.js" async></script>
```

- `data-position="bottom-right"` (or `bottom-left`) floats it in a corner instead of placing it where the tag
  is.
- `data-theme="dark"` or `"light"` fixes its colours. By default, it follows the visitor's.
- `widget.js?lang=sq` shows it in another of the page's languages.

```html
<script src="https://mon.pingomni.com/s/example-isp/widget.js?lang=sq" data-position="bottom-right" data-theme="dark" async></script>
```

**The state as JSON** for your own code (any website may read it):

```bash
curl https://mon.pingomni.com/s/example-isp/summary.json
```

```json
{
  "page": { "title": "Example ISP status", "url": "https://mon.pingomni.com/s/example-isp" },
  "status": "partial",
  "description": "Partial outage",
  "language": "en",
  "services": [ { "name": "Main website", "status": "down" }, { "name": "Mail", "status": "up" } ],
  "incidents": [ { "service": "Main website", "kind": "down", "started_at": "2026-10-30T10:01:05+00:00",
                   "updates": [ { "body": "We are investigating problems loading our website.", "at": "2026-10-30T10:05:00+00:00" } ] } ],
  "updated_at": "2026-10-30T10:06:00+00:00"
}
```

`status` is `up`, `degraded`, `partial`, `major` or `unknown`. The badge, the widget and the JSON update about
once a minute.

## 13. Maintenance

**Maintenance → Plan maintenance** sets a time when work is expected. During it, monitors are still checked
and show their state, but **no incident opens and nobody is alerted**.

| Setting | Example |
|---|---|
| Title | `Core router software upgrade` |
| Starts / Ends | `2026-11-05 02:00` to `2026-11-05 03:00` (in the workspace's time zone) |
| Monitors | **All monitors**, or the ones you choose |

**Example:** the router upgrade needs a reboot, from 02:00 to 03:00. Plan a window with the monitors *Core
router*, *Main website* and *Mail*. At 02:10 the router reboots. The monitors show it, but no incident opens, and no email, Telegram
or PagerDuty alert goes out. Tell your customers in advance yourself (for example by email); the window does not
show on status pages.

A window can be deleted before or while it runs. Deleting it ends it at once.

## 14. Reports

**Reports** shows one month at a time (this month so far, or any of the last 12), measured against an **SLA
target**: 99, 99.5, 99.9 (the default), 99.95 or 99.99 %.

For each monitor, it shows the uptime, whether the target was **met** or **missed**, the outages, the total
and the longest downtime, and the average response time. A line for all monitors comes last.

**Example: the SLA report for October.** Your contract with a customer promises 99.9 %. Choose **Month:
October 2026** and **SLA target: 99.9 %**. **Download CSV** gives the same table for a spreadsheet or the
customer:

```csv
Monitor,Type,Checks,Uptime %,SLA 99.9 %,Outages,Downtime (minutes),Longest outage (minutes),Average response (ms)
Main website,http,44640,99.97,met,2,13,9,184
Mail,smtp,8928,99.82,missed,1,80,80,92
All monitors,,53568,99.94,,3,93,,
```

Uptime is the share of checks that reached the target. A degraded check counts as up; a paused monitor is not
checked, so paused time does not count. An outage is a confirmed incident (section 8). For past months,
reports use daily totals, which are kept for 400 days whatever the plan.

## 15. Team

In a company workspace, **Team** lists everyone with their role and when they were last seen.

**Example: invite a colleague.** Enter `ana@example.com`, choose the role **member**, and choose **Send the
invitation**. Ana gets an email with a link valid for 7 days. She opens it and signs in with her own PingOmni
Account; a free account is enough. Billing stays with the owner.

- Change someone's role from the list, or **Remove** them.
- A pending invitation can be withdrawn.
- If you belong to several workspaces, switch between them at the top of the left panel.

## 16. Settings

- **Workspace**: the name, the type (company or personal) and the **time zone**. The time zone is used for
  reports, maintenance windows and dates in emails. Example: `Europe/Tirane`.
- **Plan and billing**: the current plan, what is used of each limit, and **Manage the plan**, which opens
  PingOmni Account.
- **API**: API keys for the API (section 17) and AI assistants (section 18). A key only reads, unless you tick **May
  change things**. The key is shown once, when made; store it then. Delete a key to stop it at once.
- **Activity**: who changed what lately, including changes made through the API.

## 17. The API

Everything above can be automated over HTTPS. Make a key in **Settings → API** and send it as a Bearer token.
Answers are JSON.

```bash
export POM="pom_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
curl -H "Authorization: Bearer $POM" https://mon.pingomni.com/api/v1/monitors
```

| Method and path | What it does |
|---|---|
| `GET /api/v1/monitors` | every monitor and its state |
| `POST /api/v1/monitors` | add a monitor |
| `GET /api/v1/monitors/{id}` | one monitor, with uptime for 1, 7 and 30 days |
| `PUT /api/v1/monitors/{id}` | change it |
| `POST /api/v1/monitors/{id}/pause` and `/resume` | pause or resume it |
| `POST /api/v1/monitors/{id}/check` | check it now and return the result |
| `DELETE /api/v1/monitors/{id}` | delete it |
| `GET /api/v1/incidents?status=open&monitor_id=12&limit=20` | incidents, newest first |
| `GET /api/v1/incidents/{id}` | one incident with its notes and updates |
| `POST /api/v1/incidents/{id}/acknowledge` | acknowledge it |
| `POST /api/v1/incidents/{id}/notes` | add a team note: `{"body": "…"}` |
| `POST /api/v1/incidents/{id}/updates` | post a public update, emailed to subscribers: `{"body": "…"}` |
| `GET /api/v1/status-pages` | status pages, each with its current summary |
| `GET /api/v1/maintenance?when=upcoming` | maintenance windows (`upcoming` or `past`) |
| `POST /api/v1/maintenance` | plan a window |
| `DELETE /api/v1/maintenance/{id}` | delete a window |
| `GET /api/v1/uptime?from=2026-10-01&to=2026-10-31` | uptime per monitor for a period (at most 400 days) |

Read-only keys can use the `GET` requests only. Each key may make 120 requests a minute, on every plan.
Errors come back with the HTTP status and a message, for
example `422` with `{"message": "Your plan allows 25 monitors.", "errors": {"name": ["Your plan allows 25 monitors."]}}`.

**Example: add a website monitor from a deployment script.**

```bash
curl -X POST https://mon.pingomni.com/api/v1/monitors \
  -H "Authorization: Bearer $POM" -H "Content-Type: application/json" \
  -d '{
        "name": "Client B website",
        "type": "http",
        "target": "https://www.client-b.example/",
        "interval": 60,
        "alerts": true,
        "tags": ["client b", "web"],
        "config": { "expect": "200", "slow_ms": 1500, "slow_for": 5, "alert_after": 2 }
      }'
```

The settings in `config` use the same names as in section 7: `method`, `expect`, `timeout`, `follow`,
`verify_tls`, `keyword`, `keyword_mode`, `json_path`, `json_op`, `json_value`, `warn_days`, `record`, `tls`,
`send`, `expect_text`, `subprotocol`, `engine`, `grace`, `slow_ms`, `slow_for` and `alert_after`. For example,
a database monitor:

```json
{ "name": "Orders DB", "type": "database", "target": "db.example.com", "interval": 300, "config": { "engine": "postgres" } }
```

**Example: silence alerts during a deployment.**

```bash
# Plan a 15-minute window for monitors 12 and 14, starting now (times are in the workspace's time zone)
curl -X POST https://mon.pingomni.com/api/v1/maintenance \
  -H "Authorization: Bearer $POM" -H "Content-Type: application/json" \
  -d "{\"title\":\"Deploy $(git rev-parse --short HEAD)\",\"starts_at\":\"$(date '+%F %T')\",\"ends_at\":\"$(date -d '+15 min' '+%F %T')\",\"monitor_ids\":[12,14]}"

./deploy.sh

# Check at once that the site is back
curl -X POST -H "Authorization: Bearer $POM" https://mon.pingomni.com/api/v1/monitors/12/check
```

The check returns `{"data": {"status": "up", "message": "200 OK", "response_ms": 184, "monitor": {…}}}`.

**Example: the monthly uptime as CSV with `jq`.**

```bash
curl -s -H "Authorization: Bearer $POM" "https://mon.pingomni.com/api/v1/uptime?from=2026-10-01&to=2026-10-31" \
  | jq -r '.data[] | [.name, .uptime] | @csv'
```

**Example: Python, list what is down.**

```python
import os, requests
r = requests.get("https://mon.pingomni.com/api/v1/monitors", headers={"Authorization": f"Bearer {os.environ['POM']}"}, timeout=10)
for m in r.json()["data"]:
    if m["status"] in ("down", "degraded"):
        print(f'{m["name"]}: {m["status"]} ({m["message"]})')
```

## 18. AI assistants (MCP)

PingOmni Monitor has an MCP connector, so an AI assistant can read your monitors and, with a read-and-change
key, act on them. Make a key in **Settings → API** first.

**Example: Claude Code.**

```bash
claude mcp add --transport http pingomni https://mon.pingomni.com/api/mcp \
  --header "Authorization: Bearer pom_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Any other MCP client that supports streamable HTTP works the same way: the address is
`https://mon.pingomni.com/api/mcp` and the key goes in the `Authorization` header.

| Tools for every key | Tools for read-and-change keys only |
|---|---|
| List monitors, get a monitor | Check a monitor now |
| List incidents, get an incident | Pause a monitor, resume a monitor |
| List status pages | Add a monitor |
| List maintenance | Acknowledge an incident, add a team note |
| Get uptime | Post a public status update |
| | Plan maintenance |

**Examples of what to ask:**

- *"What is down right now, and since when?"*
- *"What was the uptime of everything tagged client a last month? Put it in a table."*
- *"Add keyword monitors for https://shop.example.com/ and https://shop.example.com/cart that look for 'Add to
  cart', every minute."*
- *"Acknowledge the open incident on Main website and add the note: restarting web2."*
- *"Plan maintenance for the core router tonight from 02:00 to 03:00."*
- *"Write a short public update for the website incident saying we found the cause and it is fixed."*

With a read-only key, the assistant can only look. Use one when you only want answers.

## 19. Good to know

- **Where checks come from.** Checks run from PingOmni's probes and send the User-Agent
  `PingOmniMonitor/1.0 (+https://mon.pingomni.com/bot)`. If your firewall or Cloudflare blocks them, the page
  **mon.pingomni.com/bot** explains how to allow them.
- **Private addresses are not checked.** A target that is, or resolves to, a private or reserved address
  (`10.x`, `192.168.x`, `127.0.0.1`…) is refused: *"points to a private or reserved address, which monitors
  cannot reach."* Use a heartbeat from inside your network (section 7).
- **Time zone.** Maintenance windows and emails use the workspace's time zone (section 16).
- **Uptime** is the share of checks that reached the target. A degraded check counts as up.
- **History.** Individual checks are kept as long as your plan says (section 3). Daily totals are kept for
  400 days, so reports for past months still work.
- **Light and dark.** The app follows your device's appearance.
- **Help.** **Get help** in the left panel sends a message to PingOmni with your workspace attached. You can
  also write to hello@pingomni.com. We answer usually within one working day.
