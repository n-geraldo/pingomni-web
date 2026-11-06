# RadiusOne user guide

What each page of the portal does, every field and button on it, how it works behind the scenes, and the
server commands that go with it, for the operators who run RadiusOne. Installing the server is in
[INSTALL.md](../INSTALL.md).

Page names below are as they appear in the portal's navigation: **Page → tab**. The portal's **Documentation**
link opens this guide. Examples use placeholder
addresses and IDs (192.0.2.x, 198.51.100.x, example.com, 123456789), never a real server's settings.
Commands are run on the RadiusOne server over SSH.

## Contents

1. [Getting started](#1-getting-started)
2. [Dashboard](#2-dashboard)
3. [Clients](#3-clients)
4. [Services and IP pools](#4-services-and-ip-pools)
5. [Data caps](#5-data-caps)
6. [NAS devices](#6-nas-devices)
7. [OLT and client mapping](#7-olt-and-client-mapping)
8. [Monitoring](#8-monitoring)
9. [Network operations](#9-network-operations)
10. [Billing](#10-billing)
11. [Contracts](#11-contracts)
12. [Pay page and online payments](#12-pay-page-and-online-payments)
13. [Reports and logs](#13-reports-and-logs)
14. [Your profile](#14-your-profile)
15. [Settings: overview and software update](#15-settings-overview-and-software-update)
16. [Settings: operators](#16-settings-operators)
17. [Settings: licence and Pro](#17-settings-licence-and-pro)
18. [Settings: regional](#18-settings-regional)
19. [Settings: email and SMS gateways](#19-settings-email-and-sms-gateways)
20. [Settings: customer messages](#20-settings-customer-messages)
21. [Settings: admin alerts and daily report](#21-settings-admin-alerts-and-daily-report)
22. [Settings: branding](#22-settings-branding)
23. [Settings: invoices and receipts](#23-settings-invoices-and-receipts)
24. [Settings: firewall](#24-settings-firewall)
25. [Settings: backups](#25-settings-backups)
26. [Settings: data retention](#26-settings-data-retention)
27. [Server operations](#27-server-operations)
28. [Command reference](#28-command-reference)
29. [Troubleshooting](#29-troubleshooting)

---

## 1. Getting started

RadiusOne is the operator portal for a FreeRADIUS server: customers and their internet plans, the routers
(NAS) they connect through, billing, monitoring, and messages to customers and to your team. Everything a
page changes is stored in the same MariaDB database FreeRADIUS reads, so most changes apply at the
customer's next login, and the portal can push them to an online customer straight away (see
[Network operations](#9-network-operations)).

### How the pieces fit

| Part | What it does |
| --- | --- |
| FreeRADIUS | Answers your routers: is this username and password right, which speed and IP address does it get. Writes the accounting (who is online, traffic). |
| MariaDB | One `radius` database holding customers, plans, NAS devices, accounting, invoices and settings. |
| The portal (nginx + PHP) | The pages in this guide. |
| The scheduler | One cron line that runs the background jobs every minute (expiry, billing, monitoring, messages, alerts). See [Server operations](#27-server-operations). |
| Root helpers | Small scripts in `/usr/local/sbin/radiusone-*` that let the portal restart services, change the time zone, run backups, apply the firewall and install updates, and nothing else. |

### A first day, step by step

1. **Sign in** with the administrator the installer printed and set up two-factor authentication.
2. **Settings → Regional**: choose the currency and the time zone ([section 16](#18-settings-regional)).
3. **Settings → Branding**: your company name and logo ([section 20](#22-settings-branding)).
4. **Services**: create your plans, e.g. *Home 50* at 50/10 Mbps for 20.00 a month ([section 4](#4-services-and-ip-pools)).
5. **NAS devices**: add your router, restart FreeRADIUS, then configure the router ([section 6](#6-nas-devices)).
6. **Clients**: add a customer and connect them ([section 3](#3-clients)).
7. **Settings → Notifications**: an email or SMS gateway, then customer messages and admin alerts.
8. **Settings → Backups**: a passphrase and at least one off-server destination.

### Signing in

1. Open the portal (for example `https://radius.example.com`) and sign in with your operator username and password.
2. If two-factor authentication is on for your account, enter the 6-digit code from your authenticator app.
3. Operators with the role superadmin, admin, NOC, billing or security **must** use two-factor
   authentication: on their first sign-in they are shown a QR code to scan before they can continue.
   Support and view operators may turn it on themselves under their profile.

After 5 wrong passwords, that login is blocked from that address for 15 minutes (`LOGIN_MAX_ATTEMPTS` and `LOGIN_DECAY_MINUTES` in `.env` change this), so guessing is not practical.

### Staying signed in and confirming sensitive actions

Once you are signed in, the portal does not ask for your password again for most work. A few actions need a
*recent* sign-in: revealing a customer's saved password, suspending or restoring a service, retrying a
network operation, classifying a legacy invoice and restarting services. If your sign-in is older than the
limit, the portal shows **Confirm identity**: enter your password (and code) and the action continues.

Sign out (your name at the top → **Sign out**) when you leave a shared computer: anyone at an open session
can do what your role allows.

### Roles

| Role | What it can do |
| --- | --- |
| superadmin | Everything: Settings, operators, licence, firewall, backups, updates, service restarts and this documentation. |
| admin | Clients (add, edit, disconnect, suspend, archive), services, NAS devices, network operations, billing, reports, logs and customer documents. No Settings. |
| NOC | Clients (add, edit, disconnect, suspend), services, NAS devices, network operations, reports and logs. No billing. |
| billing | Invoices and payments, and reading clients, services and customer documents. Cannot lift manual or security suspensions. |
| security | Suspend and restore clients (including *security* suspensions only this role and superadmin can lift), disconnect, NAS read-only, logs and network operations. No plan or payment changes. |
| support | Read-only: dashboard, clients, services, NAS, reports and network operations, including connection diagnostics. |
| view | Read-only access to the pages it can open. |

Every change is written to the audit log ([Logs](#13-reports-and-logs)) with the operator, the time and
the address it came from.

### Lists, filters and exports everywhere

Most lists work the same way:

- **Search and filters** at the top narrow the list; **Clear** removes them. The address bar keeps the filter,
  so you can bookmark *Clients → Expired* or send the link to a colleague.
- **Export** downloads the rows as CSV. *All matching* exports every row the filter finds (the client list
  and invoices go to the server for this), *This page* only what you see.
- Long lists are paged; the page size and page number are in the address too.
- **Actions** (the ⋯ button on a row) holds the less common actions for that row.

## 2. Dashboard

The first page after sign-in. Everything on it refreshes by itself while the page is open.

| Part | What it shows | Refresh |
| --- | --- | --- |
| **Key figures** | Online clients, enabled, expired and disabled clients, NAS devices, traffic of sessions started today and this month, and total clients. Online, NAS devices and total are links to the matching list. Expired turns amber when there are any. | every 60 s |
| **NAS status** | One card per router with its address and badges: *RADIUS disabled* if it is switched off, how disconnects are sent (CoA or API), how many fresh sessions it has, and with SNMP set up its response time (e.g. *SNMP 4 ms*, or *SNMP no response* in red; click it for the NAS monitor). **Monitoring** in the header opens the full page. | every 30 s |
| **Recent authentication rejects** | The latest refused logins with time, username and FreeRADIUS's reply. Click a username to find the client; **All rejects** opens the full log. | every 30 s |
| **Top users this month** | Customers with the most download and upload this month. Click a username to open the client. | on load |

Two buttons sit at the top: **New client** and **Review overdue invoices** (opens Billing filtered to
overdue). Each only appears if your role may use it.

**Example.** A customer calls: "my internet doesn't work". The reject list shows
`jdoe · Login incorrect` a minute ago: the router sends a wrong password. You open the client, check the
password with **Reveal saved password**, and read it to the customer to re-enter in their router.

## 3. Clients

Each client is one internet account: a PPPoE username and password (or a MAC address for DHCP), a service
plan, an expiry date, contact details and optional restrictions. **Clients** in the menu lists them.

### The client list

| Column | Meaning |
| --- | --- |
| Username | The login, with the authentication method below it (PPPoE or DHCP). |
| Customer | Name or company, with the phone below. |
| Plan | The service plan. |
| Status | The account state (enabled, disabled, expired, suspended, archived) and the connection (online, offline). |
| IP / NAS | When online: the IP address, the router and the MAC address of the customer's device. |
| Traffic | Download and upload of the current session. |
| Expiry | The service end date. |
| Balance | What the customer still owes on open invoices. |

**Filters:** a search box (name, username or phone, partial matches work), the service plan, the NAS device
and the status: *Online now*, *Offline*, *Enabled*, *Disabled*, *Expired*, *Suspended* or *Archived*.

**Row actions:** *Session / disconnect* (when online), *Diagnostics* and *Archive*.

**Bulk actions:** tick clients (or the box in the header for the whole page), open **Bulk actions**,
choose *Suspend*, *Disable* or *Archive*, and **Apply**. You confirm once for all of them.

**Example: find everyone on a plan who has expired.** Plan: *Home 50*, Status: *Expired*, then
**Export → All matching** to get a CSV for your call list.

### Add a client

1. **Clients → New client** (or **New client** on the Dashboard).
2. Fill in the **Account** tab:

   **Credentials**

   | Field | What to enter |
   | --- | --- |
   | Authentication | *PPPoE username/password* (the usual) or *DHCP MAC address* (the router logs the customer in by the MAC address of their device). |
   | Username | The PPPoE login, e.g. `jdoe` or `0691234567`. Up to 64 characters, no spaces. For DHCP it is filled with the MAC address. |
   | PPPoE password | The password the customer's router uses. **Generate password** makes a random 14-character one and shows it so you can read it to the customer; **Copy password** copies it. On an existing client, leave it blank to keep the saved one. |

   **Service and status**

   | Field | What to enter |
   | --- | --- |
   | Account status | *enabled* (can connect), *disabled* (cannot, e.g. a contract on hold) or *suspended*. |
   | Expiry date | The last day of paid service. After it passes, the customer moves to the plan's *expired service* (see below). Empty means no end date. |
   | Service plan | The plan from **Services**. |
   | Static IP pool / Static IP address | Only when the customer buys a fixed IP: choose the pool, then one of its free addresses. |
   | Customer alerts | Tick **Email alert** and/or **SMS alert** only if the customer agreed to messages. Customers with a box off never receive messages on that channel. |
   | Online payment | **May pay on the pay page**: on by default. Off for a customer who must pay at the office ([Pay page](#12-pay-page-and-online-payments)). |

   **Access restrictions** (optional)

   | Field | What it does |
   | --- | --- |
   | CPE MAC address | The MAC of the customer's router, written `AA:BB:CC:00:11:22`. Required for DHCP. |
   | Allow this MAC only | PPPoE only: the login is refused from any other device. Stops a customer from sharing their password. |
   | NAS restriction | *All NAS*, or lock the account to one router by its *NAS-IP-Address* (e.g. `192.0.2.1`) or *NAS-Identifier* (e.g. `bras-north`), entered in **NAS restriction value**. |
   | DHCP client identifier, Trusted NAS access circuit | For DHCP set-ups where the router reports the customer's port (option 82). Use only on an isolated access port or VLAN, never on a value the customer can send themselves. |

3. Fill in the **Personal Info** tab: first and last name, company name, VAT/tax ID, language; phone, cell
   phone and email; the installation address (address, city, state, ZIP, country, GPS position such as
   `41.3275,19.8187`); the contract ID, the date the contract is valid until, and internal notes.
4. Optionally attach the customer's **ID front** and **ID back** on the **Documents** tab (JPEG, PNG, WebP
   or PDF).
5. **Save**. The account can connect at once.

If a save is refused (for example the username is taken), everything you typed stays in the form, on the tab
you were on, with the problem marked.

### The client profile

Opening a client shows a header with the name, username, status badges, phone and email, the
**Diagnostics** and **New invoice** buttons, and a row of figures (plan, expiry, balance, online state).

**Account Overview** (on the right, refreshed every 15 seconds) shows the live session: online since, IP
address, NAS, MAC, session traffic, and these buttons:

- **Connection diagnostics** (see below).
- **Reveal saved password**: shows the PPPoE password once, in a panel at the top. Needs a recent sign-in,
  and every reveal is written to the audit log. The password does not end up in your browser history.
- **Disconnect active session**: sends a disconnect to the router for exactly this session. The customer's
  router normally reconnects within seconds, now with the current plan and settings. This is how a speed
  change reaches an online customer. If it cannot be sent (no session, the NAS is waiting for a FreeRADIUS
  restart, CoA off), the button says why.

The tabs:

| Tab | What it holds |
| --- | --- |
| Account | Credentials, plan, status and restrictions (as above). |
| Personal Info | Identity, contact, installation address, contract and notes. |
| Accounting | A 7-day graph of session traffic and the list of sessions: start, stop (or *online*), duration, IP, NAS, download, upload and why it ended (e.g. *User-Request*, *Lost-Carrier*, *Admin-Reset*, *Session-Timeout*). |
| ONU | Only when OLTs are set up: the ONU the customer is behind, its signal and status, and linking by serial number. See [OLT](#7-olt-and-client-mapping). |
| Billing | Figures (open, overdue, paid), the invoices and the payments of this customer, and **New invoice**. |
| Documents | Uploaded ID documents with type, file name and upload date; **Download**. Documents are kept even when the client is archived, and are included in backups. |
| Logs | The audit trail for this client: who changed what and when. |

### Connection diagnostics

**Diagnostics** answers "why can't this customer connect?" in one table, read from the database and the
latest RADIUS records:

| Signal | Example evidence |
| --- | --- |
| Billing state | `current`, `due` or `overdue` |
| Service entitlement | `active`, `expired 2026-10-31`, `suspended (manual)` |
| Suspension source | `none`, `manual`, `security`, `billing` |
| Network provisioning / revision | Whether the current plan has been sent to the router, e.g. `5 / 5` (desired / verified). |
| Observed connection | `online`, `offline`, `stale` (no accounting update for longer than expected) |
| Last authentication | `Access-Accept at 2026-11-06 09:14:02` or `Access-Reject at ...` |
| Current authorization policy | `eligible` or `blocked`, and the reason (e.g. `authorization_deadline_elapsed` when the expiry passed) |
| NAS, adapter, model | The router the customer last used and how RadiusOne talks to it. |
| Selected / effective plan | The plan on the client, and the one actually sent (the expired plan, or a data-cap slow-down plan). |
| Generated reply policy | The RADIUS attributes the router gets, e.g. `Mikrotik-Rate-Limit := 10M/50M; Framed-Pool := home` |
| Address, MAC, accounting age | The IP, the device MAC and how many seconds since the router last reported the session. |

Below it are the **Network operations** for this customer (disconnects and plan changes with their state
and the router's answer), and **Service restriction**:

- **Suspend service**: blocks the account until it is restored. Choose the reason: *Manual*, or *Security*
  (security role and superadmin only; only they can lift it). A payment never lifts a manual or security
  suspension.
- **Restore manual suspension**: lifts it again.

Both need a recent sign-in and are written to the audit log.

### Disable, suspend, archive: which one?

| Action | Customer can connect? | When to use |
| --- | --- | --- |
| Disable (Account status) | No | Account on hold, e.g. a customer away for months. |
| Suspend (Diagnostics) | No | A temporary block with a reason (unpaid, abuse). Restore lifts it. |
| Expired (automatic) | Gets the plan's expired service | The paid period ended. A renewal payment ends it. |
| Archive | No; disappears from normal lists | The customer left. Billing, documents and history are kept; *Status → Archived* still finds them. Existing sessions are not cut, so disconnect first if needed. You type the username to confirm. |

> When a service end date passes, the expiry job moves the customer to the plan's *expired service*
> group, so the router gives them the expired behaviour (for example a slow speed or a payment page)
> instead of normal access. Paying the renewal invoice in full moves the end date forward and restores
> the normal plan.

### Example: a new PPPoE customer on a MikroTik

1. **New client**: Authentication *PPPoE*, username `jdoe`, **Generate password** (`k7Qm2vXp9LtR4a`),
   plan *Home 50*, expiry `2026-12-05`, tick **SMS alert**.
2. Personal Info: *John Doe*, phone `0691234567`, address `Rruga e Kavajes 10, Tirana`.
3. Save. On the customer's router, set PPPoE to `jdoe` / `k7Qm2vXp9LtR4a`.
4. Within seconds the client shows **online** with an IP from the plan's pool, and the *Welcome* message
   goes out if it is switched on ([Customer messages](#20-settings-customer-messages)).

## 4. Services and IP pools

A service plan is a RADIUS group: speeds, price, IP behaviour and what happens after expiry. Clients on the
plan receive its attributes when they log in. **Services** lists the plans with download and upload, price,
data cap, the expired service, how many clients use it and whether it is enabled.

### Create a plan

**Services → New plan**:

| Field | Example | What it does |
| --- | --- | --- |
| Name | `Home 50` | Shown everywhere in the portal and on invoices. |
| RADIUS group name | `home50` | The group FreeRADIUS uses. Renaming it later moves every client and invoice on the plan to the new name (you confirm first). |
| Description | `Fibre, 50/10 Mbps` | For your team. |
| Enabled | on | Disabled plans cannot be chosen for new clients, and are not billed. |
| Customer download (Mbps) | `50` | Speed towards the customer. |
| Customer upload (Mbps) | `10` | Speed from the customer. Give both or neither. |
| IP behavior | *Dynamic pool* | *Dynamic pool*: the router hands out an address from the pool named below. *Static per client*: each client gets the address chosen on their profile. *No IP attribute*: the router decides. |
| IP pool name | `home` | The name of the address pool **on the router** (MikroTik: `/ip pool`). |
| Session timeout | `86400` | Seconds before the router ends a session and the customer reconnects. Empty: no limit. |
| Idle timeout | `1800` | Seconds without traffic before the session ends. Empty: no limit. |
| Simultaneous use default | `1` | How many sessions one login may have at once. `1` stops password sharing. |
| Billing mode | *prepaid* | A label only: a renewal always needs full payment. |
| Expired service | `expired` | The plan customers move to when their expiry date passes, e.g. a 1 Mbps plan whose router redirects to a payment page. |
| Price | `20.00` | Monthly price in the currency set under **Settings → Regional**. Used by recurring billing; a plan priced 0 is never billed. |

Under **Advanced legacy RADIUS attributes**, **Custom group attributes** adds vendor-specific attributes the
fields above do not cover, one per line, as `check` or `reply`, the attribute, the operator and the value.
Lines starting with `#` are ignored:

```
# Put customers in a RouterOS address list, and ask for accounting every 5 minutes
reply Mikrotik-Address-List := customers
reply Acct-Interim-Interval := 300
```

Attributes the portal manages itself (speed, pool, timeouts, Simultaneous-Use, passwords...) are refused
here, so a custom line cannot fight a plan field.

### What the router receives

For a MikroTik PPPoE plan of 50/10 Mbps with a dynamic pool `home`, the reply is:

```
Mikrotik-Rate-Limit := 10M/50M      (upload/download, as RouterOS reads it)
Framed-Pool := home
Session-Timeout := 86400
```

For Cisco IOS XE the speeds are sent as `Cisco-AVPair` QoS policies instead. The client's
**Diagnostics → Generated reply policy** shows exactly what is sent.

### A plan for expired customers

1. Create a plan `Expired` (group `expired`), download `1`, upload `1`, price `0`.
2. On the router, put the `expired` customers in an address list or pool that redirects web traffic to your
   payment page (optional).
3. On each paid plan, set **Expired service** to `Expired`.

From then on an expired customer still connects, at 1 Mbps, until they pay.

### Static IP pools

**Services → Static IP pools** lists the addresses you sell, with a price per address.

| Field | Example |
| --- | --- |
| Pool name | `Business IPs` |
| Pool key | `business` (left blank, it is made from the name) |
| IP addresses / ranges | One per line or comma separated: `198.51.100.10`, `198.51.100.20-29`, `198.51.100.40-198.51.100.47` or a small CIDR such as `198.51.100.64/29` (/24 to /32). |
| Static IP price | `5.00` a month, added to invoices as the *Static IP add-on*. |
| Description, Enabled | For your team; a disabled pool is not offered on new clients. |

The client form then offers only the **free** addresses of the chosen pool; the address is sent to the
router as `Framed-IP-Address`. On the router, the address must be routed to the customer (MikroTik PPPoE does
this by itself).

A plan or pool that clients still use cannot be deleted: the delete button says how many clients use it.
Move or archive them first.

## 5. Data caps

A plan can include a data allowance per billing cycle, for example 200 GB a month, with two possible
outcomes when a customer uses it up: a message only, or a slower plan until the next cycle.

### Set a cap on a plan

On **Services → the plan**, under **Data cap**:

| Field | Example | What it does |
| --- | --- | --- |
| Data cap per cycle (GB) | `200` | Download plus upload, per customer, per cycle. Empty: no cap. |
| When the cap is reached | *Slow down to another plan* | *Notify only*: customers get the messages and keep their speed. *Slow down to another plan*: they also move to the slow-down plan. |
| Slow-down plan | `Capped 2 Mbps` | Any other plan, used until the cycle ends. |

### How it works

- Every 5 minutes `radiusone:collect-usage` adds up each customer's traffic per day from the RADIUS
  accounting (so the router's interim updates must be on).
- A cycle ends on the customer's expiry date and starts one billing period earlier. A customer whose service
  runs until 5 December on a monthly plan has a cycle of 6 November to 5 December. Without an expiry date, the
  cycle is the calendar month.
- At **80%** the customer gets the *Data cap 80% used* message, and at **100%** *Data cap reached*, once per
  cycle each, by email and/or SMS as their alert boxes allow ([Customer messages](#20-settings-customer-messages)).
- With *Slow down*, at 100% the customer is moved to the slow-down plan within a minute (the expiry job
  publishes it, and an online customer is disconnected so they reconnect at the new speed). When the next
  cycle starts, or the plan's cap is removed or raised, they get their normal plan back the same way.
- Every slow-down and release is in the audit log as `usage_capped` / `usage_released` with the bytes used.

**Example.** *Home 50* has a 200 GB cap and slows down to *Capped 2 Mbps*. On 28 November `jdoe` reaches
160 GB and gets "You have used 80% of your data". On 2 December he reaches 200 GB, gets "You have reached your
data limit", and his router reconnects at 2 Mbps. On 6 December the new cycle starts and he is back at 50 Mbps.

> Data caps need the expiry job (`RADIUSONE_SCHEDULE_EXPIRY_SYNC=true`) for the slow-down, and the network
> worker (`NETWORK_WORKER_ENABLED=true`) to move online customers straight away. See
> [Server operations](#27-server-operations).

## 6. NAS devices

A NAS is a router (BRAS) that sends customer logins to RADIUS. FreeRADIUS only answers NAS devices listed
here, switched on, and loaded at its last start.

**MikroTik RouterOS** is tested end to end (PPPoE login, IP address, speed limits, disconnect). **Cisco IOS
XE** is marked **Beta**: it follows Cisco's documentation but has not been tested on a real router yet, so
check logins and disconnects carefully before relying on it.

### The NAS list

| Column | Meaning |
| --- | --- |
| Name, NAS IP, Vendor, Description | What you entered. |
| RADIUS | Whether FreeRADIUS accepts requests from it (switched on or off). |
| RADIUS update | *Up to date*, or *Waiting* when saved changes need a FreeRADIUS restart (see below). |
| Disconnect | How disconnects are sent: *CoA* or *API*. |
| SNMP | Off, or the version in use. |
| Online now | Fresh sessions from this NAS. |

**Unknown routers.** When an address sends RADIUS requests but is not a NAS here, the list shows a warning
with the address, whether FreeRADIUS refused it or the firewall dropped it, how many times, when last, and
**Add as NAS**. That is often your own router sending from another
address, or behind NAT. Addresses you do not recognise may be scanners on the internet: do not add those.

### Add a NAS

1. **NAS devices → New NAS device**.
2. The **Device** tab:

   | Field | Example | What it does |
   | --- | --- | --- |
   | Name | `bras-tirana-01` | Short label shown in lists. |
   | NAS IP address | `192.0.2.1` | The address the router sends RADIUS **from**. The API and SNMP use it too. |
   | Vendor | MikroTik RouterOS | Decides the attributes sent (speeds) and how disconnects work. |
   | RADIUS shared secret | `Gx8!t2...` (long and random) | Must be identical on the router. |
   | Accept RADIUS requests from this NAS | on | Off: FreeRADIUS ignores it after the next restart. |
   | Disconnect sessions with RADIUS (CoA) | on, port `3799` | MikroTik uses 3799; Cisco often 1700. |
   | Description | `Main POP, rack 2` | Optional, for your team. |

3. **Save**, then **restart FreeRADIUS** (**Monitoring → RADIUS server → Restart** next to FreeRADIUS). Until
   then the NAS shows *Waiting*.
4. Configure the router: the **Router setup** tab lists the steps for its vendor (below).
5. Optional: the **API** tab (MikroTik) and the **SNMP** tab for monitoring.

### Router setup: MikroTik RouterOS

Replace `203.0.113.5` with this RadiusOne server and `192.0.2.1` with the NAS IP you entered:

```
# 1. This server as RADIUS, with the same secret, sending from the NAS IP
/radius add address=203.0.113.5 secret="Gx8!t2..." service=ppp,dhcp src-address=192.0.2.1 timeout=3s

# 2. PPPoE logins through RADIUS, with an accounting update every minute
/ppp aaa set use-radius=yes accounting=yes interim-update=1m

# 3. Accept disconnects (CoA) from RADIUS servers listed above
/radius incoming set accept=yes port=3799

# 4. The address pool the plan names (IP behaviour: Dynamic pool, IP pool name: home)
/ip pool add name=home ranges=10.10.0.2-10.10.255.254
/ppp profile set default local-address=10.10.0.1
```

For local DHCP logins by MAC address, also set `radius=yes` on the DHCP server
(`/ip dhcp-server set dhcp1 use-radius=yes`). RouterOS accepts disconnects only from the RADIUS servers listed
under `/radius`, signed with the right secret.

### Router setup: Cisco IOS XE (Beta)

1. Define this server in an AAA server group with the same shared secret, sourced from the NAS IP.
2. Point PPPoE or IPoE/ISG login and accounting at it (UDP 1812 and 1813).
3. Enable periodic accounting, every 1 to 5 minutes.
4. Allow this server as a dynamic-authorization (CoA) client on the CoA port, and check it on your release.
5. Optional: SNMP limited by an ACL to this server.

### The API tab (MikroTik, optional)

With **Enable RouterOS API**, disconnects use the RouterOS API instead of RADIUS CoA: the portal reads the
session list and removes exactly the matching session. It connects to `tls://<NAS IP>:8729` (api-ssl).

- **API user / API password**: a dedicated RouterOS user with only the read, write and api policies.
- The router's certificate must be valid for the NAS IP and trusted by this server.

```
/user group add name=radiusone policy=read,write,api,!local,!telnet,!ssh,!ftp,!winbox,!web,!password,!sniff,!sensitive,!romon
/user add name=radiusone group=radiusone password="a-long-password" address=203.0.113.5/32
/ip service set api-ssl disabled=no port=8729 address=203.0.113.5/32 certificate=router-cert
```

### The SNMP tab (Pro: monitoring)

With **Poll this NAS over SNMP**, the poller records CPU, memory, temperature and interface traffic every
minute for the Monitoring graphs. Only read requests are sent.

| Field | v2c | v3 |
| --- | --- | --- |
| Version | `2c` | `3` |
| Read-only community | `monitor-ro` | |
| Security name (user) | | `radiusone` |
| Authentication | | SHA1, SHA256 ... with its password |
| Privacy (encryption) | | AES-128 (supported by MikroTik and Cisco), needs authentication |
| Management host | Optional: another address to poll instead of the NAS IP | same |
| UDP port, Timeout (ms), Context | Usually 161, 1000 and empty | same |

On MikroTik:

```
# v2c
/snmp set enabled=yes
/snmp community add name=monitor-ro addresses=203.0.113.5/32 read-access=yes write-access=no

# v3 (the community name is the v3 user)
/snmp community add name=radiusone security=private authentication-protocol=SHA1 \
    authentication-password=auth-secret encryption-protocol=AES encryption-password=priv-secret \
    addresses=203.0.113.5/32 read-access=yes write-access=no
```

Without SNMP the NAS is still checked by ping.

### The Sessions tab

The latest sessions on this NAS from RADIUS accounting: username, when it started, how long, and its state.

### The Diagnostics tab: when a router cannot log customers in

**Connection checklist**, refreshed while the tab is open:

| Check | What a failure means |
| --- | --- |
| NAS is switched on | *Accept RADIUS requests* is off. |
| Saved settings are loaded | FreeRADIUS still uses the old address or secret: restart it. |
| NAS IP is an address | A name or network was entered; the router must send from one exact address. |
| FreeRADIUS is running | The service is stopped; start it under Monitoring. |
| Listening on UDP 1812 and 1813 | FreeRADIUS did not start correctly. |
| Firewall lets it through | The RadiusOne firewall (or ufw) blocks the router. |
| No connection errors in the log | FreeRADIUS logged *unknown client* or the firewall dropped this address today. |
| Logins from this NAS | Accepted and rejected logins in the last 24 hours. |
| Accounting | Open sessions, and when the last update came (a stale one means interim updates are off). |

**60-second packet test.** Press **Start**, then make a login attempt on the router (reconnect a PPPoE
client). After a minute the portal says what happened, for example:

- *Nothing arrived from 192.0.2.1*: the router sends from another address, to another server, or something on
  the way blocks UDP 1812.
- *The shared secret is wrong*: the packets arrived but were signed with another secret. FreeRADIUS does not
  log this outside debug mode, so this test is the quickest way to find it.
- *Requests arrive, but the firewall blocks them*.
- *The connection works, but FreeRADIUS rejects the logins*: look at the username and password.
- *Logins work*.

The packets stay in memory on the server, readable only by root and the web server, and are deleted after 15
minutes. Neither the secret nor the passwords are shown.

**Recent errors** lists FreeRADIUS's errors and rejected logins of the last 24 hours in plain words, with
how to fix each.

### "Waiting for FreeRADIUS restart"

Changing a NAS address, name, type or shared secret, or switching it on or off, raises its *config
revision*. FreeRADIUS reads the NAS list only when it starts, so such a change takes effect after a FreeRADIUS
restart. Until then the NAS shows **Waiting** and the portal does not send disconnects or speed changes to it.

Within a minute after FreeRADIUS has started again, the portal records the change as in effect by itself
(`radiusone:mark-nas-applied --auto`; FreeRADIUS does not start with a broken NAS list). CoA, API and SNMP
settings are used by the portal alone and apply at once, without a restart.

### Removing a NAS

**Remove** on the list disables the NAS at once and deletes it at the next FreeRADIUS restart; after that its
requests are rejected. The confirmation says how many customers are online on it.

## 7. OLT and client mapping

**OLT** in the menu reads a Huawei MA5800-X7 and shows each ONU's port, status, optical signal and last
disconnect, and which client is on it. The portal **only reads**: its SNMP client cannot send a change, and its
telnet client can send only `enable`, `scroll`, `display mac-address all` and `quit`.

### Before adding the OLT

- This server must reach the OLT's management address on **UDP 161** (SNMP) and **TCP 23** (telnet). Allow it in
  any ACL on the OLT.
- Use a **read-only** SNMP community:

  ```
  snmp-agent community read monitor-ro
  snmp-agent sys-info version v2c
  ```

  SNMP v3 works too.
- **Telnet is optional, and not encrypted.** It gives the MAC addresses behind each ONU, which is how clients
  are found automatically. Use a user with few rights, on your management network.

### Add an OLT

1. **OLT → New OLT**: name (e.g. `olt-tirana-01`), model, management IP address, **Read this OLT** on, the SNMP
   settings (version, read-only community, or the v3 user with authentication and privacy) and, optionally, **Read
   the MAC table over telnet** with its port, user and password.
2. **Test connection** reads the OLT once and says what answered.
3. **Save**. The ONU list is read every 5 minutes, the MAC table every 15, and cards and ports every minute.
   **Read now** on the OLT's page reads it at once.

### The OLT's page

| Tab | What it shows |
| --- | --- |
| ONUs | Every ONU: port, serial number, description, model, status, signal at the ONU and at the OLT (e.g. `-21.4 dBm`), distance, when it was last offline, and the linked client. Search, and filter by *Online*, *Offline* or *Weak signal*. |
| Ports | Each port: state, speed, traffic and errors. |
| Cards | Each card: status, CPU, memory, temperature and power input, and fans if the OLT reports them. |
| Graphs | ONUs online over time, control card CPU and memory, the hottest card, and uplink traffic, over up to 7 days. |

A dash means the OLT did not report that value.

### How clients are linked

- **From the session:** when an online client's MAC is behind exactly one ONU, the client is linked to it (needs telnet).
- **From the description:** when an ONU's description on the OLT matches a username, and only one ONU has it.
  Writing the PPPoE username as the ONU description when you install it makes this automatic.
- **By hand:** on the client's **ONU** tab, enter the serial number (e.g. `48575443A1B2C3D4`) and link it.

A link follows the serial number, so it survives the ONU moving to another port. It is never replaced
automatically. **OLT → Client mapping** shows clients with no ONU, and **Session points elsewhere** when a
client's session now comes from another ONU, for you to decide. After you unlink a client, it is not linked
automatically again.

### On Monitoring

Each OLT has a card with its ONUs online, offline and with a weak signal, and how old the list is. **Needs
attention** lists a failed read, an OLT no longer being read, a PON port where two or more ONUs all went offline
in the last 24 hours (often a cut fibre), a faulty card, a power input or fan fault, a card at 75 °C or more, a
card's CPU at 90% or more, and an uplink that is down.

## 8. Monitoring

**Monitoring** shows the RADIUS server, every NAS and every OLT on one page, refreshing by itself.

- **Needs attention** at the top lists what is wrong now, in red or amber: CPU above 90%, memory above 95%,
  disk above 90%, a NAS that stopped answering, an OLT problem, or a stuck background job.
- **Status** has one card per device with its health and online customers. **Monitor** on a NAS card opens its
  own page.
- **Background jobs** shows when each scheduled job last ran and whether it worked. A job that is not running
  leaves its feature off (for example, no messages are sent while the customer messages job is stopped).
- **Poll all devices now** takes a sample of every device at once instead of waiting for the next minute.

### RADIUS server page

- **Services**: FreeRADIUS, MariaDB, Nginx, PHP-FPM and Cron, each with its state and how long it has been
  running (*up 4d 6h 37m*). The time starts from zero after every restart.
- **System**: uptime, load, memory, disk and temperatures (a virtual machine usually has no sensors).
- **History**: CPU, memory and traffic graphs by time range (hours to days).
- **Poll server now** records a sample at once.

### Restarting a service

Superadmins see a **Restart** button next to FreeRADIUS, MariaDB, Nginx and PHP-FPM.

- The configuration is checked first (`freeradius -C`, `nginx -t`, `php-fpm8.3 -t`); if the check fails nothing
  is restarted and the error is shown, so a typo cannot leave the service down.
- The restart starts two seconds after you confirm, so the page can answer first. The status updates within
  about 15 seconds.
- **FreeRADIUS**: authentication and accounting stop for a few seconds; routers retry, so online customers
  normally stay connected. **MariaDB**: the portal and RADIUS logins fail for a few seconds (you type `restart`
  to confirm). **Nginx / PHP-FPM**: the portal is unreachable for a few seconds.
- Every restart and failed attempt is written to the audit log.

> The installer sets this up: a small helper and a sudo rule that let the web server restart exactly these four
> services and nothing else. To set it up again by hand: `sudo bash ops/radiusone-postinstall` in the app folder.

### NAS monitor (Pro: monitoring)

Each NAS with SNMP has its own page:

- **Live health**: CPU, memory, temperature, uptime and the device description (`sysDescr`).
- **Busiest interfaces**: speed, traffic in and out, totals and errors.
- **Sessions**: fresh RADIUS accounting sessions on this NAS.
- **Graphs**: traffic per interface, CPU and memory, and temperature, by time range.
- **Network tables**: *IP addresses*, *ARP*, *MAC table*, *BGP peers* and *OSPF neighbours*, each read live from
  the router over SNMP when you open its tab. **Refresh** reads it again, **Filter rows** narrows the rows (for
  example type a MAC address to find which port it is on), and the table can be exported as CSV. A device that
  does not publish a table over SNMP shows it empty with a note (RouterOS may not publish OSPF).
- **SNMP OID reference**: the OIDs read for this platform, to check against the router's MIBs.
- **Poll this NAS now** records a sample at once.

## 9. Network operations

When a customer's access changes (plan, speed, expiry, suspension, data cap), the portal records the new policy
and, for an online customer, queues an **operation**: usually a disconnect, so the router reconnects them with the
new attributes. An offline customer simply gets the new policy at the next login.

**Network operations** lists the latest operations:

| Column | Meaning |
| --- | --- |
| Created | When it was queued. |
| Customer | Whose session. |
| Action | `apply`, `suspend`, `restore` or `disconnect`. |
| Revision | The customer's policy revision it carries. |
| State | `pending`, `running`, `ack` (the router accepted), `verified` (the new session was seen), `nak` (refused), `timeout`, `uncertain`, `failed` or `blocked`. |
| Result | The router's answer, e.g. `Disconnect-ACK`, `Disconnect-NAK (Session-Context-Not-Found)` or `timeout`. |

A refused disconnect is retried five times, then left as failed for you to look at. **Reconcile / retry**
(needs a recent sign-in) marks it uncertain; the worker looks at the customer's session again and resends only
if it is still needed.

Operations are sent by the network worker (`NETWORK_WORKER_ENABLED=true`). While it is off they wait, and
Monitoring shows the worker as not sending.

**Example.** You move `jdoe` from *Home 50* to *Home 100* while he is online. Within a minute the list shows
`apply · verified`; his router reconnects and *Diagnostics* shows `Mikrotik-Rate-Limit := 20M/100M`.

## 10. Billing

**Billing** holds invoices and payments (Pro: billing).

### The billing page

- **Cards** at the top: what is still to collect, what is overdue and what came in this month. Click one to see
  those invoices.
- **Status tabs** above the list filter by *All*, *To collect* (open, partly paid and overdue), *Overdue*, *Paid*,
  *Drafts* and *Cancelled*, with a count on each.
- **Search** by invoice number or customer.
- **Latest payments** on the side.
- **Export** downloads the invoices (with the current filter) as CSV.

### Create an invoice

**New invoice** (or **New invoice** on a client):

| Field | Example | What it does |
| --- | --- | --- |
| Customer | `jdoe` | Type a name or username. |
| Service plan | *Home 50* | The internet charge at the plan's price. Choose *No internet charge* for an invoice with only a static IP. |
| Static IP add-on | *Business IPs* | Adds the pool's price. |
| Billing period | *Monthly* | Monthly, 2, 3 or 6 months, or yearly; the amount is the monthly price times the months. |
| Issue date | `2026-11-06` | The period starts here. The due date is the end of the period (`2026-12-05` for one month). |
| Discount, Tax | `2.00`, `3.60` | Amounts in your currency, under the fold. |
| Line description | `Home 50, November` | Optional; printed on the PDF. |
| Notes | `Thank you for your business.` | Printed on the PDF. |

The summary on the right shows the total and the due date as you type. **Issue invoice** bills the customer
(the invoice gets its number, e.g. `INV-202611-000123`); **Save as draft** keeps it to finish later. A draft can
be deleted; an issued invoice can only be **cancelled** (marked void), so the numbering stays complete.

### Record a payment

On an unpaid invoice, **Record payment**:

| Field | Example |
| --- | --- |
| Amount | `20.00` (less than the balance makes it *partial*) |
| Date | `2026-11-07` |
| Method | cash, bank transfer, mobile money, card, check or other |
| Reference | `BKT-55821` or a receipt number |
| Note | optional |

When a renewal invoice is **fully** paid, the customer's expiry date moves to the end of the invoice period (never
backwards), an expired customer gets normal access again, and the *Service extended* message goes out. A
payment never lifts a manual or security suspension.

### PDFs

On an invoice, **Draft PDF** is the payment request and **Payment receipt** confirms a payment, with your
uploaded logo and company name. Their wording is set under
[Invoices and receipts](#23-settings-invoices-and-receipts).

### Recurring invoices and overdue

Every night at 03:15 (server time) `radiusone:generate-billing`:

1. Marks open and partial invoices past their due date as **overdue**.
2. For every enabled customer on an enabled plan with a price above 0, creates the next invoice when its period
   is due. The next period starts the day after the current expiry date, so invoices follow each customer's own
   cycle.
3. Skips a customer who still has an unpaid generated invoice, so unpaid months do not pile up, and never bills
   the same cycle twice.

To bill one customer now: `sudo radiusone-root-artisan radiusone:generate-billing --username=jdoe`.

### Legacy invoice review

Invoices imported from a system before RadiusOne may need a decision before recurring billing can continue for
that customer. Such an invoice shows **Legacy invoice review**: choose the **Classification**, write the
**Review evidence** (what you checked) and, if known, the original anchor. Classify only from evidence you
reviewed.

## 11. Contracts

**Contracts** (Pro: contracts) ties a customer to a plan for a term, such as 12 months billed monthly. The contract text
comes from your template and is kept exactly as issued, so changing the template later never changes a signed contract.
A customer has at most one active contract.

### Write the template

**Settings → Contracts**: the **Title on the PDF** (e.g. `Internet service contract`) and the **Template**, in your own
words and language. A line starting with `#` is a heading. Placeholders:

| Placeholder | Becomes |
| --- | --- |
| `{contract_number}` | The contract's number |
| `{customer}`, `{username}`, `{company}`, `{tax_id}` | Who it is for |
| `{address}`, `{city}`, `{phone}`, `{email}` | Their details from the client |
| `{plan}`, `{download}`, `{upload}` | The plan and its speeds |
| `{monthly_price}`, `{currency}`, `{billing_period}` | What it costs and how often it is billed |
| `{start_date}`, `{end_date}`, `{term_months}`, `{today}` | The dates |

```
# Internet service contract {contract_number}
Between {company} and {customer} (username {username}), {address}, {city}.
Plan: {plan}, {download}/{upload} Mbps, {monthly_price} {currency} a month, billed {billing_period}.
Term: {term_months} months, from {start_date} to {end_date}.
```

Have a lawyer check the text before you use it.

### Issue a contract

**Contracts → New contract**:

| Field | Example | Notes |
| --- | --- | --- |
| Customer username | `jdoe` | The contract uses this customer's current plan and price. |
| Term (months) | `12` | The customer cannot pay online for time past the end of the term. |
| Billing period | Monthly | Monthly, 3 months, 6 months or yearly: how often the customer is invoiced. |
| Start date | `2026-11-07` | The term ends the day before the same date, e.g. `2027-11-06`. |
| Issue the first invoice for this period now | on | Bills the first period straight away. |

The contract's page shows the text, the PDF to print and sign, its invoices and its online payments. **Cancel contract**
ends it early; the history stays. The list under **Contracts** can be searched and filtered by status (active, ended,
cancelled). The nightly invoices follow the contract's billing period and stop at its end; contracts past their end
date are marked ended by themselves.

## 12. Pay page and online payments

Customers can pay their internet by card on your own page, such as `https://pay.example.com`, through **POK** or
**Stripe** (Pro: contracts). They pay on POK's or Stripe's own secure page: card details never reach RadiusOne. A
payment counts only after RadiusOne asks POK or Stripe and finds it completed for the full amount, in the right
currency. Then the invoice is issued and paid, and the service is renewed, at once.

### How a customer pays

1. They open the pay page and enter their **username** and the **last 4 digits of their phone number** (the phone or
   cell phone saved on the client).
2. They see their plan, how long it is paid for and how long the contract runs (their name is shown masked, e.g.
   `A**** D**`).
3. They choose how long to pay for (1, 3, 6 or 12 months, only inside the contract), and POK or Stripe.
4. They pay on the service's page and come back to *Payment received, thank you. Your service is paid until …*.

A wrong username and a wrong phone number get the same answer, so the page does not tell anyone which usernames exist.
After 5 wrong phone numbers, that username must wait 15 minutes. A customer without an active contract, or with online
payment turned off, cannot pay here.

### Set it up

1. **Point the address at RadiusOne.** Behind a Cloudflare Tunnel: add a public hostname such as `pay.example.com` to the
   tunnel that serves the portal, with the same service (for example `http://10.0.0.5:80`). Without a tunnel: point the
   name at the server and run `sudo radiusone-pay-domain pay.example.com` (it gets a Let's Encrypt certificate and adds
   the nginx site).
2. **Settings → Pay page**: tick **Turn on the pay page**, enter the **Address** and the **Language of the page**
   (Albanian or English). Under *How it looks*: the title, your colour, a description and a footer (for example your
   phone number and office hours). The logo comes from Settings → Branding.
3. **POK and/or Stripe**: tick **Offer POK** / **Offer Stripe**, fill in the credentials, choose the mode, press **Test the
   saved … key**, and **Save**.

The page only answers on its own address, and the portal never answers there.

### Test and live mode

Each service has **Test credentials** and **Live credentials**, saved apart, and a switch, **The pay page uses**: *Test:
no real money* or *Live: real payments*. New installs start in test mode.

| | Test | Live |
| --- | --- | --- |
| POK | POK's staging service (`api-staging.pokpay.io`) with your staging merchant id, key id and key secret | POK production (`api.pokpay.io`) with your production keys |
| Stripe | A secret key starting `sk_test_` | A secret key starting `sk_live_` |
| A completed payment | Recorded under Online payments as *POK (test)*, but **no invoice is issued and the service is not renewed** | Issues and pays the invoice, and renews the service |
| The pay page | Shows *Test mode: no real money is taken* | Normal |

Test payments are not counted in the *Paid today / this month* totals. A payment always stays in the mode it started
in, so switching to live never turns a test payment into a real one.

**Going live, step by step:**

1. Save the test credentials, press **Test the saved test key**, and pay once with a test card on your own account.
2. Check it under **Online payments** (it shows *(test)*, no invoice).
3. Save the live credentials and press **Test the saved live key**.
4. Switch **The pay page uses** to *Live* and **Save**. The test-mode note disappears from the page.

POK's keys come from your POK merchant account (pokpay.io). Stripe's secret keys are in the Stripe dashboard under
Developers → API keys; the publishable key is not used. Stripe opens accounts only in the countries it supports (not
Albania); check stripe.com/global. Optionally, add a webhook in Stripe to `https://pay.example.com/pay/webhook` for the
`checkout.session` events, so payments show at once; without it they are checked every 5 minutes.

### Turn it off for one client

On a client's **Account** tab, **Online payment → May pay on the pay page** is on by default. Turn it off for a customer
who must pay at the office: the pay page then tells them online payment is not available and to contact you.

### Online payments

**Online payments** lists every payment started on the page: when, the customer, the service (*POK*, *Stripe*, or with
*(test)*), the amount, the period it covers, the invoice and the status:

| Status | Meaning |
| --- | --- |
| Waiting | The customer is on the service's page, or has not finished. |
| Paid | Completed and applied (a live one has its invoice). |
| Not completed | Cancelled, expired or failed: no money was taken. |
| Needs review | The service took money but it could not be applied by itself (a different amount or currency, for example). |
| Reviewed | Someone handled it. |

The cards at the top show what was paid today and this month, what is waiting, and what needs review. Search, filter by
status, service and dates, and export as CSV. On a payment, **Check now** asks the service again; for one that needs
review, check the order at POK or Stripe, apply it by hand under Billing if needed, then write **What was done** to
close it. Admin alerts include payments that need review.

Every 5 minutes `radiusone:sync-payments` checks the payments still open (in case a webhook was missed) and ends
contracts past their end date.

## 13. Reports and logs

### Reports

Choose a date range (and optionally a username) to see:

- **Accounting sessions started** in the range: start, stop, duration, username, download and upload, with a
  *quality* note on sessions that are stale (no update for too long) or have suspicious counters; the totals of
  each are at the top.
- **Session totals by start date**: download, upload and total per day.
- **Open accounting sessions**: the latest 200 sessions still open, with their last update, so you can spot
  stale ones (a router that stopped sending accounting).

All tables can be exported as CSV.

### Logs

- **Authentication attempts** (latest 200): every accepted and rejected login with time, username and reply.
  Filter by username (exact or partial) and by reply (*All*, *Rejects*, *Accepts*).
- **Admin audit log**: who changed what and when, from which address. Search by operator, action, entity or IP,
  e.g. `reveal_password`, `disconnect`, `nas.packet_test`, `usage_capped` or an operator's name.

How long login and session records are kept is set under [Data retention](#26-settings-data-retention).

## 14. Your profile

Click your name at the top to open your profile:

- **Name and email**, and the portal **language**.
- **Password**: at least 10 characters; enter the current one first.
- **Two-factor authentication**: **Set up authenticator**, scan the QR code with an authenticator app (Google
  Authenticator, Microsoft Authenticator, 1Password and similar), enter the current 6-digit code to confirm.
  From then on, sign-in asks for a code. Roles that require it cannot turn it off.

Lost your phone? Another superadmin can reset your account under **Settings → Users**, or on the server:
`sudo radiusone-root-artisan radiusone:reset-password jane --reset-2fa`.

## 15. Settings: overview and software update

**Settings** (superadmins only) opens on **Overview**: a card per settings area (Users & access with the number
of enabled operators, Notifications, Branding with the logo in use, Backups, Data retention), and **System
information**: the environment, operator access and backup locations of this server.

### Software update

**Software update** shows the installed version.

1. **Check for updates** reads the latest release on GitHub and shows **What is new in x.y.z**.
2. **Install RadiusOne x.y.z** asks once, then:
   - downloads the release (`radiusone-x.y.z.tar.gz`) and checks its checksum;
   - backs up the database and archives the app folder;
   - pauses the portal (maintenance mode) for a few minutes. **RADIUS keeps authenticating customers**;
   - copies the new files in (`.env`, `storage` and uploads stay), applies database migrations and permissions,
     refreshes the root helpers and brings the portal back.
3. The page shows each step and reloads when it is done. If a step fails, the previous version comes back and
   the page says where it stopped. **Update log** shows the full log
   (`/var/lib/radiusone/update-status/update.log`).

Only published releases are installed (tags such as `v2.8.0`). The server needs HTTPS access to `api.github.com`
and `github.com`, and no git, Node.js or Composer.

The same from the server:

```bash
sudo radiusone-update --check     # what is installed and what is available
sudo radiusone-update             # install the latest release
sudo radiusone-update v2.8.0      # install that release
```

**Finish moving to RadiusOne** appears only on servers installed before 2.3 (the app in
`/opt/freeradius-web-laravel`): it moves the app to `/opt/radiusone`, renames the folders, database accounts and
server files, and leaves the old paths as links. Preview it without changing anything:
`sudo bash ops/radiusone-upgrade-2.3 --dry-run`.

## 16. Settings: operators

**Settings → Users** lists the operators with name, email, username, role, status, two-factor (2FA) and last login. **Role access** explains each role (the table in [Getting started](#roles)).

### Add an operator

1. **New user**.
2. **Username** (e.g. `jane`), **Name**, **Email**, a **Password** of at least 10 characters (tell it to them
   separately), and the **Role**.
3. **Enabled** on, then save.
4. On their first sign-in, operators in roles that require it set up two-factor authentication.

### Change or remove an operator

- Change the role, name or email and save; the new rights apply on their next page.
- Switch **Enabled** off to stop them signing in; type a new **Password** to reset theirs.
- **Two-factor** on their page: one button makes them set up a new authenticator at their next sign-in (a lost
  phone), **Disable 2FA** turns it off (only for roles that do not require it).
- **Delete** removes the login; their audit history is kept.

Give each person their own account and the smallest role that fits their work: *billing* for the accountant,
*support* for the help desk, *NOC* for network engineers.

From the server, for a lost superadmin password:

```bash
sudo radiusone-root-artisan radiusone:reset-password            # lists the logins
sudo radiusone-root-artisan radiusone:reset-password admin      # asks for a new password
sudo radiusone-root-artisan radiusone:reset-password admin --reset-2fa
```

## 17. Settings: licence and Pro

RadiusOne **Community** is free and includes everything RADIUS needs: clients, plans, NAS devices, disconnects,
data caps, OLTs, network operations, reports, logs, the firewall and local backups, for up to **150 clients**
(not counting archived ones).

**RadiusOne Pro** adds, per licence:

| Pro feature | What it unlocks |
| --- | --- |
| Billing and invoices | The Billing pages, recurring invoices and PDFs. |
| Customer notifications and admin alerts | Email, SMS and Telegram: customer messages, bulk messages, admin alerts and the daily report. |
| NAS monitoring and traffic | SNMP on NAS devices, the NAS monitor pages and graphs. |
| Remote backups | Encrypted copies to Backblaze B2, Cloudflare R2 or SFTP. |
| Your logo | Your logo in the portal and on PDFs. |
| Customer contracts and the pay page | Contracts, the public pay page with POK and Stripe, and Online payments. |

for up to 999 clients (Licence 1), 4,999 (Licence 2) or with no limit (Licence 3).

### Add a licence key

1. Buy or renew in your PingOmni account (`https://account.pingomni.com`) and copy the key. It starts with
   `RADIUSONE1`.
2. **Settings → License → Add a licence key**, paste the whole key and **Save the key**.
3. The page shows **Licensed to**, **Valid until**, the **Licence id**, **Clients** (e.g. `412 of 999`), whether
   the server is registered with your **PingOmni account**, and each feature as **On** or **Pro**.

The key is checked on this server with PingOmni's public key: Pro never depends on reaching PingOmni. The server
then registers with your account (`license:check-in`, every 5 minutes when due) so you can see it there, and
picks up a renewed key by itself. That check-in only reports; it never switches a feature off.

### When a licence expires

Nothing stops. RADIUS keeps working, Pro pages stay readable and Pro jobs keep running (invoices are still
generated, alerts still sent), but nothing in a Pro feature can be **changed** until the licence is renewed, and
new clients are held to the Community limit. Over a limit, every existing client keeps working; only adding new
ones is refused.

**Remove the licence** returns the server to Community.

## 18. Settings: regional

### Currency

The currency the whole system bills in: service plans, static IP pools, invoices and payments, e.g. *Euro (EUR)*
or *Albanian lek (ALL)*. Choosing another one asks first, then switches plan and pool prices and draft invoices
to the new currency. **Amounts are not converted**: check your prices afterwards. Issued invoices keep the
currency they were issued in; the page says how many there are, and totals show each currency separately.

### Time zone

The server's time zone, e.g. `Europe/Tirane`. Billing dates, expiry times, the nightly jobs and every time shown
follow it. Choosing another one asks first, then a database backup is taken and the portal pauses for about a
minute while the server, MariaDB, FreeRADIUS and the portal move to the new zone and **every stored time is
converted**, so old and new records line up.

From the server: `sudo radiusone-set-timezone apply Europe/Tirane`. Choose the zone at install time if you can
(`install.sh --timezone Europe/Tirane`).

## 19. Settings: email and SMS gateways

Customer messages and admin alerts are sent through the gateways under **Settings → Notifications → Gateways**
(Pro: notifications).

### Email

| Provider | What you need |
| --- | --- |
| Custom SMTP | Host, port, encryption (TLS/SSL), username and password from your mail provider. |
| Mailgun | Sending domain, API key and region (US or EU). |

Set a **From email** your provider allows (for example `noc@example.com`) and optionally a **Reply-to email**.
Emails go out under your company name from **Settings → Branding** (RadiusOne when none is set); invoice and
receipt PDFs and the brand name in SMS texts use the same name.

**Example: Gmail / Google Workspace SMTP.** Host `smtp.gmail.com`, port `587`, encryption *TLS*, username your
address, password an *app password* from your Google account (not your normal password).

### SMS

| Provider | What you need |
| --- | --- |
| Twilio | Account SID, auth token and a sender number or messaging service SID. |
| Infobip | Your base URL, an API key (portal → Developer tools → API keys) and a registered sender. |
| Custom HTTP | The provider URL with `{phone}` and `{message}` placeholders (or a POST body), the HTTP method, a timeout, and optionally the text a successful answer contains. |

**Example: a custom HTTP gateway.**

```
Gateway URL template:   https://sms.example.com/send?to={phone}&text={message}&key=YOUR-KEY
HTTP method:            GET
Success text contains:  "status":"ok"
```

The **Default country code** turns local numbers into international ones (with `355`, `0691234567` becomes
`+355691234567`). Leave it blank if every saved number already has its country code.

After saving, use **Send test** on each gateway. "Accepted" means the provider took the message; check that it
arrives.

> Gateway passwords, tokens and keys are stored encrypted and are never shown again. Leave a password field empty
> to keep the saved value.

## 20. Settings: customer messages

Under **Settings → Notifications** (Pro: notifications):

### Templates

| Template | Sent when |
| --- | --- |
| Welcome | Once, after a new customer's first verified activation. |
| Service extended | A saved renewal or full payment moves the expiry date forward. |
| Data cap 80% used | A customer on a capped plan reaches 80% of the cap ([Data caps](#5-data-caps)). |
| Data cap reached | They reach 100%. |
| Custom | Never by itself: your starting point for bulk messages. |

**Edit template**: turn Email and/or SMS on, and write the subject (email) and message. Placeholders:

| Placeholder | Becomes |
| --- | --- |
| `{name}` | The customer's name |
| `{username}` | The login |
| `{service}` | The plan name |
| `{expiry}` | The expiry date |
| `{app_name}` | Your company name |
| `{phone}`, `{email}` | The customer's contacts |
| `{used}`, `{cap}`, `{percent}`, `{resets}` | Data caps only: used, the cap, the percentage, the day the cycle resets |

Example *Service extended* SMS:

```
{name}, your {service} internet is paid until {expiry}. Thank you! {app_name}
```

### Send a bulk message

1. **Send bulk message**, choose **Email** or **SMS**.
2. **Find customers** by name, username or phone and tick them, or choose all active customers (up to 1,000).
3. Write the subject and message (placeholders work) and **Review**.
4. The preview shows exactly what each customer receives and how many are skipped (no email, alert box off).
   Nothing is sent until you confirm; the preview expires after 30 minutes.

**Example:** planned maintenance. SMS, all active customers on NAS *bras-north*:
`{name}, internet in your area will be off on Sunday 02:00-04:00 for maintenance. {app_name}`.

### History

Every message with its time, customer, channel, recipient and status: *sent*, *failed* with the provider's
reason, *skipped* with why, or *uncertain*. "Uncertain" means the provider did not clearly answer; it is not
retried automatically, so check with the provider before resending.

Customers whose Email or SMS alert box is off never receive messages on that channel. Queued messages are sent
every minute by `radiusone:process-customer-notifications`.

## 21. Settings: admin alerts and daily report

Admin alerts tell your team when something on the server or network needs attention, and send a daily report.
Set them up under **Settings → Notifications → Admin alerts** (Pro: notifications).

### Set up

1. Set up the Email gateway (and SMS, if you want text alerts). Telegram is set up on the same page, see below.
2. Tick **Send admin alerts and reports** and add the recipients: **Email recipients** and/or **SMS recipients**,
   separated by commas.
3. Choose what to watch and the channels for alerts.
4. Optionally turn on the **daily report** and its time (**Send at**, server time).
5. Save, then press **Send test alert** and **Send report now**.

### How alerts work

| Check | Alerts when |
| --- | --- |
| Server services | FreeRADIUS, MariaDB, Nginx, PHP-FPM or Cron is not running. |
| NAS | A NAS stops answering ping, or its SNMP data is older than the stale limit. NAS devices switched off for RADIUS are ignored. |
| Resources | Disk `/` is 90% full or more, or memory is 95% used or more. |
| Background jobs | A job is stuck (for example router changes waiting with nothing being sent). |

- Checks run every minute. A problem must still be there on the next check before it alerts, so a restart does not wake anyone.
- When it clears you get a **RESOLVED** message with how long it lasted.
- One message per check lists every new and resolved problem, plus those still open.
- **Recent alerts** shows the last 30 alerts, reports and tests with who received them and any provider error.
  One failing recipient does not stop the others.

> **Warning:** If MariaDB itself is down, the alert job cannot read its settings and no alert is sent. You will
> see it on Monitoring, and in the next report once the database is back.

### Message templates

The wording of alerts can be changed; a blank field uses the default:

| Template | Default | Placeholders |
| --- | --- | --- |
| Alert subject | `[{app}] {summary} on {host}` | `{app} {host} {summary} {events} {events_short} {open} {time}` |
| Alert message | `{events}` then the server, the time and `{open}` | same |
| Alert SMS / short text | `{app}: {events_short}` | same |
| Daily report subject | `[{app}] Daily report {date} · {status}` | `{app} {host} {date} {status} {time}` |
| Daily report opening text | empty | same |

Example alert email:

```
Subject: [OptixNet] 1 new problem on radius.example.com

NEW  NAS bras-north (192.0.2.1) is not answering ping
RESOLVED  Disk / 91% full, lasted 2h 14m

Server: radius.example.com
Time: 2026-11-06 09:14
```

### Daily report

Sent by email (and Telegram when chosen, never by SMS) at the chosen time: open problems, server uptime and load,
each service with its uptime, RADIUS logins accepted/rejected in the last 24 hours, every NAS with status and
online users, customers (total, active, expired, expiring within 7 days), background jobs, and the alerts of the
last 24 hours.

### Telegram

Telegram is used only for admin alerts and the report, never for customer messages.

1. In Telegram, open **@BotFather**, send `/newbot`, choose a name and a username ending in *bot*, and copy the
   token it gives you (it looks like `123456789:ABC…`).
2. Send any message to your new bot. For a team group, add the bot to the group and write a message there. For a
   channel, add the bot as an administrator.
3. In **Admin alerts → Telegram**, paste the **Bot token** and save. It is stored encrypted and never shown again.
4. Press **Find chat IDs**. It lists the chats that wrote to the bot, for example `123456789 · Name (private)` or
   `-1001234567890 · Team (group)`.
5. Copy the numbers into **Telegram chat IDs** (separated by commas; `@channelname` also works for public channels).
6. Tick **Telegram** under *Send alerts by*, and optionally **Also send the daily report to Telegram**. Save and
   press **Send test alert**.

If a test fails, Recent alerts shows Telegram's reason: *chat not found* (wrong ID, or nobody wrote to the bot
yet), *bot was blocked by the user*, or *Unauthorized* (wrong or revoked token; create a new one with `/token` in
@BotFather). To stop Telegram, untick it, or tick **Remove the saved bot token**.

## 22. Settings: branding

Under **Settings → Branding**:

- **Company name**: shown in the portal, on PDFs, as the email sender name and as `{app_name}` in messages. Leave
  it empty to use *RadiusOne*.
- **Logo** (Pro: branding): upload a PNG, JPEG or WebP (up to 2 MB), or link one hosted on your website over HTTPS
  (e.g. `https://example.com/logo.png`). The preview shows it before you save. The logo appears in the sidebar
  and on the sign-in page; only an uploaded logo also appears on PDF invoices and receipts. **Reset to default
  logo** removes it.

## 23. Settings: invoices and receipts

The wording of the two PDFs your customers get (Pro: billing). Edit the text in use; an empty field goes back to
the default.

| Document | Where it comes from |
| --- | --- |
| Payment request | Billing → invoice → **Draft PDF**, sent before payment. |
| Payment receipt | Billing → invoice → **Payment receipt**, confirming a payment. |

For each: the title, notes and footer. They can use `{invoice} {customer} {username} {total} {paid} {balance}
{due} {issued} {period}`. **Preview** opens a sample PDF (save first).

Example payment request note:

```
Please pay {balance} by {due} for {period}.
Bank: Example Bank, IBAN AL00 0000 0000 0000 0000 0000 0000, reference {invoice}.
```

## 24. Settings: firewall

**Settings → Firewall** manages this server's own firewall from the portal, with nftables. It starts **off**.
The first time you open the page it fills in a template you can change:

- **Management networks**: the address you opened the page from. SSH and the portal are always open to these
  networks, whatever the rules say.
- **Rules**: the portal (TCP 80 and 443) from anywhere, and RADIUS (UDP 1812 and 1813) from your routers.

Everything else coming in is dropped. Replies to the server's own connections (CoA, SNMP, the RouterOS API,
updates) still get through.

### Rules

**Add rule**:

| Field | Example | Notes |
| --- | --- | --- |
| Action | accept | accept, drop or reject |
| Protocol | udp | tcp, udp, tcp+udp, icmp or any |
| Source | `198.51.100.0/24` | An address, a network, `routers` (every NAS address), or empty for anyone. |
| Ports | `161` | One port, a list `80,443` or a range `1000-2000`; empty for all. |
| Comment | `Zabbix from the NOC` | |
| For | 1 hour | *Permanently*, 1 hour, 1 day or 1 week: the rule removes itself afterwards, handy to block an address for a while. |

Rules apply top to bottom (**Move up / Move down**), can be switched off without deleting them, and up to 100
can exist. **Restore the template** brings back the starting rules.

**Examples:**

- Block a scanner for a day: *drop*, *any*, `203.0.113.66`, ports empty, *1 day*.
- Let your monitoring server ping and poll: *accept*, *icmp*, `198.51.100.10`.
- A second RADIUS client network: *accept*, *udp*, `100.64.0.0/24`, `1812,1813`.

### Turning it on, and applying changes

- **Turn on** puts the rules in force. While it is on, edits are a draft until you press **Apply changes**.
- **You cannot lock yourself out by accident.** After turning on or applying, your browser has one minute to reach
  the server again, or the previous rules come back by themselves. Confirmed rules load again at boot.
- **routers** follows the NAS list by itself within a minute, with no Apply. A NAS entered by name instead of an
  address is not included; the page warns about it.
- **The nftables rules** shows exactly what is loaded.
- **Turn off** opens every port again; your rules are kept for next time.

If you cannot reach the portal any more, from the server's console:

```bash
sudo radiusone-firewall off
```

If `ufw` is active too, both firewalls apply, so a port has to be open in both; the page warns about this.

## 25. Settings: backups

Every night at 02:15 the database and customer documents are backed up on the server, encrypted, and uploaded to
each enabled destination under **Settings → Backups** (remote destinations: Pro).

1. Set the **backup passphrase** (at least 12 characters). Store it somewhere safe outside this server: without
   it no backup can be opened. Changing it affects only new backups.
2. Choose how long **local copies** stay on the server. The newest three of each kind are always kept.
3. Add destinations: [Backblaze B2](#backblaze-b2-setup), [Cloudflare R2](#cloudflare-r2-setup) (the bucket
   address and a key; for Backblaze the key alone; guides below), or **My own server (SFTP)** as `user@host` (add
   the shown public key to its authorized keys). Name, folder and copies to keep (default 7) are under **More
   options**. Then press **Test**.
4. The page shows the last run and the result per destination. **Back up now** runs one at once.

What is in a backup: the whole `radius` database (customers, plans, NAS devices, accounting, invoices, settings,
encrypted secrets) and the customer documents and logos. Local copies are in `/var/backups/radiusone/`; remote
copies are encrypted with your passphrase, e.g. `radiusone-db-20261106-021500.sql.gz.enc` and
`radiusone-docs-20261106-021500.tar.gz.enc`.

### SFTP to your own server

On the backup server:

```bash
sudo adduser --disabled-password backups
sudo -u backups mkdir -p /home/backups/.ssh /home/backups/radiusone
# paste the public key shown in the portal:
echo 'ssh-ed25519 AAAA... radiusone-backup' | sudo -u backups tee -a /home/backups/.ssh/authorized_keys
```

In the portal: destination `backups@backup.example.com`, folder `radiusone`, then **Test**.

### Backblaze B2 setup

About 10 minutes. 10 GB is free, then about 6 USD per TB per month. No app registration or approval is needed.

1. Create an account at [backblaze.com](https://www.backblaze.com/sign-up/cloud-storage) (B2 Cloud Storage) and choose a region close to you, for example *EU Central*.
2. **Create a bucket**: *B2 Cloud Storage → Buckets → Create a Bucket*. Give it a unique name (for example `isp-name-radius-backups`), set **Files in Bucket** to **Private**, leave encryption and object lock off, and create it.
3. **Create a key**: *Application Keys → Add a New Application Key*. Name it (for example *radiusone*), allow access to **this bucket only**, type of access **Read and Write**, and create it.
4. **Copy both values now**: **keyID** and **applicationKey**. The applicationKey is shown only once.
5. **In the portal**: *Settings → Backups → Add destination*, **Store backups in** **Backblaze B2**. Paste the **keyID** and **applicationKey** and save: the bucket and its endpoint are found from the key. (If the key can reach several buckets, also paste the bucket address, for example `https://s3.eu-central-003.backblazeb2.com/my-bucket`.)
6. Press **Test**. It uploads, lists and deletes a small file.

> B2 keeps old versions of a file by default. The portal deletes its own old backups by name, so set the bucket's
> **Lifecycle Settings** to *Keep only the last version of the file*; otherwise deleted copies stay billable as
> hidden versions.

### Cloudflare R2 setup

About 10 minutes. 10 GB is free and downloads (restores) are always free. A payment method is needed to enable R2, even on the free tier.

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com/) (a free account is enough) and open **R2 Object Storage**. Enable it the first time.
2. **Create a bucket**: *R2 → Create bucket*. Name it (for example `radius-backups`), location *Automatic* (or a jurisdiction such as EU), storage class *Standard*, and create it. Leave public access off.
3. **Copy the bucket address**: in the bucket, *Settings → S3 API* shows `https://<account id>.r2.cloudflarestorage.com/<bucket>`. Copy it whole.
4. **Create a token**: *R2 → Manage API tokens → Create API token* (an *Account* token). Permission **Object Read & Write**, apply to **this bucket only**, no expiry, and create it.
5. **Copy both values now**: **Access Key ID** and **Secret Access Key** (shown only once). The other token value is not needed.
6. **In the portal**: *Settings → Backups → Add destination*, **Store backups in** **Cloudflare R2**. Paste the bucket address and both keys, and save.
7. Press **Test**.

### Backup storage problems

| What you see | Cause and fix |
| --- | --- |
| InvalidAccessKeyId or SignatureDoesNotMatch | The access key ID or secret is wrong, or was deleted at the provider. Paste a current pair (the secret field keeps the saved one when left empty). |
| AccessDenied | The key is limited to another bucket, or is read-only. Give it read and write access to this bucket. |
| NoSuchBucket | The bucket address does not match the bucket (wrong name, region or account). Paste it again from the provider. |
| Could not connect / timed out | Check the bucket address and that this server can reach the internet on port 443. |
| Storage keeps growing on B2 | Set Lifecycle Settings to keep only the last version (see the note above). |

### Restoring

1. Download the newest `.enc` file from your destination to the server, e.g. into `/root/restore/`.
2. Decrypt it (asks for the passphrase):

   ```bash
   sudo radiusone-root-artisan radiusone:backup-decrypt /root/restore/radiusone-db-20261106-021500.sql.gz.enc
   ```

3. Restore the database. This **replaces** the current data, so take a fresh backup first. As root it restores
   only a root-owned file from a folder only root can write:

   ```bash
   sudo RADIUSONE_OPERATOR_ENV_FILE=/etc/radiusone/migration.env \
        radiusone-root-artisan radiusone:restore /root/restore/radiusone-db-20261106-021500.sql.gz
   ```

4. Restart FreeRADIUS (Monitoring → RADIUS server) so it reads the restored NAS list.

To move to a new server: install RadiusOne there, restore the database the same way, copy
`/var/lib/radiusone/` (documents and logos), and copy `APP_KEY` from the old `.env` so saved router, SNMP and
gateway secrets can be opened (or re-enter them).

## 26. Settings: data retention

Under **Settings → Data retention**, choose how long RADIUS history is kept:

| Records | What they are |
| --- | --- |
| Session records (`radacct`) | Who was connected, when, from which IP and how much traffic. Live sessions are never deleted. |
| Login records (`radpostauth`) | Every accepted and rejected sign-in attempt. |

The page shows about how many records each holds and the date of the oldest. Older records are deleted by the nightly
cleanup at 03:45 (`radiusone:prune-radius`, at most 10 minutes a night; the rest follows the next night). The
default keeps everything. Choosing a shorter period asks first and says what will be deleted; deleted records can
only come back from a backup.

Shorter periods keep the database fast, but reports, usage and data caps cannot look further back than the
period. Check the law in your country: many require ISPs to keep connection records for a fixed time.

## 27. Server operations

One cron line (`/etc/cron.d/radiusone`) runs the Laravel scheduler every minute as the web user. Each job keeps
its own lock, so a slow run is never started twice (a second copy exits with code 75). Each job writes its own
log in `/var/log/radiusone/`.

| Job | When | What it does | Log |
| --- | --- | --- | --- |
| `radiusone:poll-snmp` | Every minute (Pro: monitoring) | Records server and NAS samples for Monitoring. | `snmp-poll.log` |
| `radiusone:poll-olts` | Every minute | Reads each OLT when due: ONUs every 5 minutes, MAC table every 15, cards and ports every minute. Only reads, and links clients to ONUs. | `olt.log` |
| `radiusone:mark-nas-applied --auto` | Every minute | Records NAS changes as in effect once FreeRADIUS has restarted. | `nas-applied.log` |
| `radiusone:admin-alerts` | Every minute (Pro: notifications) | Admin alerts and the daily report (does nothing until enabled in Settings). | `admin-alerts.log` |
| `radiusone:process-customer-notifications` | Every minute (Pro: notifications) | Sends queued customer email and SMS. | `customer-notifications.log` |
| `radiusone:firewall sync` | Every minute | Keeps the firewall's `routers` list and timed rules up to date (does nothing while it is off). | `firewall.log` |
| `radiusone:sync-expired` | Every minute (`RADIUSONE_SCHEDULE_EXPIRY_SYNC=true`) | Expires services, moves expired and data-capped customers to their other plan and publishes changed access rules to RADIUS. | `expiry.log` |
| `radiusone:process-network-operations` | Every minute (`NETWORK_WORKER_ENABLED=true`) | Applies those changes on the network: an online customer is disconnected (CoA or RouterOS API) so they reconnect with the new rules; an offline one gets them at the next login. A refused disconnect is retried five times, then shown under Network operations. | `network.log` |
| `radiusone:collect-usage` | Every 5 minutes | Daily usage per customer from the accounting, then data caps. | `usage.log` |
| `license:check-in` | Every 5 minutes | Registers the licence's server with your PingOmni account when due (report only). | `license.log` |
| `radiusone:process-notifications` | Every 5 minutes (`RADIUSONE_SCHEDULE_EXPIRY_NOTIFICATIONS=true`, Pro: notifications) | Sends due service-expiry notifications. | `notifications.log` |
| `radiusone:backup` | 02:15 (root cron) | Database and documents backup with encrypted remote copies. | `backup.log` |
| `radiusone:sync-payments` | Every 5 minutes | Checks open pay page payments with POK or Stripe, and ends contracts past their end date. | `billing.log` |
| `radiusone:generate-billing` | 03:15 (Pro: billing) | Marks overdue invoices and creates recurring ones. | `billing.log` |
| `radiusone:prune-job-runs` | 03:30 | Removes job history older than 30 days. | `maintenance.log` |
| `radiusone:prune-radius` | 03:45 | Applies the data retention periods. | `maintenance.log` |

See what is scheduled and when it runs next:

```bash
sudo radiusone-root-artisan schedule:list
```

### The two switches in `.env`

Two jobs change customers' access and are off until you switch them on in `/opt/radiusone/.env`:

```ini
RADIUSONE_SCHEDULE_EXPIRY_SYNC=true   # expire services and apply data-cap slow-downs
NETWORK_WORKER_ENABLED=true           # disconnect online customers so changes apply now
```

The scheduler reads `.env` on every run, so they start within a minute; Monitoring → Background jobs shows them.

### Where things are

| What | Where |
| --- | --- |
| The app (code, `.env`) | `/opt/radiusone` |
| Keys and database passwords | `/etc/radiusone/portal.env`, `radius.env`, `migration.env`, `backup.env` (root only) |
| Customer documents, logos | `/var/lib/radiusone/` |
| Local backups | `/var/backups/radiusone/` (status in `status.json`) |
| Job logs | `/var/log/radiusone/` |
| App log | `/opt/radiusone/storage/logs/` |
| Updates | `/usr/local/sbin/radiusone-update`; progress and log in `/var/lib/radiusone/update-status/` |
| Scheduled jobs | `/etc/cron.d/radiusone` |
| Web server | `/etc/nginx/sites-available/radiusone` |
| Certificate | `/etc/ssl/radiusone/` (self-signed) or `/etc/letsencrypt/live/<domain>/` |
| FreeRADIUS | `/etc/freeradius/3.0/mods-available/sql`, `mods-config/sql/main/mysql/queries.conf`, `sites-available/default` |
| Root helpers | `/usr/local/sbin/radiusone-*`, `/etc/sudoers.d/radiusone` |

### Ports

| Port | Protocol | From | For |
| --- | --- | --- | --- |
| 80 | TCP | browsers, Let's Encrypt | redirect to HTTPS, certificate renewal |
| 443 | TCP | browsers | the portal |
| 1812 | UDP | your routers | RADIUS authentication |
| 1813 | UDP | your routers | RADIUS accounting |

Outgoing, the server reaches your routers on UDP 3799 (CoA), UDP 161 (SNMP), TCP 8729 (RouterOS API) and OLTs on
UDP 161 and TCP 23. MariaDB (3306) listens only on the server itself.

### Installing, repairing and updating

- **Install** on a fresh Ubuntu 24.04 server:

  ```bash
  sudo mkdir /opt/radiusone
  curl -fsSL https://github.com/Pingomni/radiusone/releases/download/vX.Y.Z/radiusone-X.Y.Z.tar.gz \
    | sudo tar -xz -C /opt/radiusone --strip-components=1
  cd /opt/radiusone
  sudo bash install.sh --domain radius.example.com --email it@example.com --timezone Europe/Tirane
  ```

  Options: `--domain`, `--email` (Let's Encrypt), `--admin-user`, `--admin-email`, `--timezone`, `--force`. The
  first administrator's password is printed once at the end: save it. Details in INSTALL.md.
- **Repair or switch to Let's Encrypt later**: run `sudo bash install.sh` again with the options. It keeps the keys,
  data and operators.
- **Root helpers only**: `sudo bash ops/radiusone-postinstall` in the app folder re-installs the helpers behind
  Restart, Regional → Time zone, Back up now, the firewall, NAS diagnostics and Software update.
- **Update**: Settings → Software update, or `sudo radiusone-update`.

## 28. Command reference

Run artisan commands as root through `radiusone-root-artisan`, never as `sudo php artisan`: that would load cache
files the web user can write. Commands that need another database identity take it from
`RADIUSONE_OPERATOR_ENV_FILE`.

### Daily work

| Command | What it does |
| --- | --- |
| `sudo radiusone-root-artisan radiusone:job-status` | Recent job runs with their result, schema state, network lag and the notification queue. The first thing to run when something seems stuck. |
| `sudo radiusone-root-artisan radiusone:generate-billing` | Creates due recurring invoices and marks overdue ones now. `--username=jdoe` for one customer. |
| `sudo radiusone-root-artisan radiusone:sync-payments` | Checks the open online payments now. |
| `sudo radiusone-root-artisan radiusone:collect-usage` | Updates usage and applies data caps now. |
| `sudo radiusone-root-artisan radiusone:sync-expired` | Expires services and publishes access changes now. |
| `sudo radiusone-root-artisan radiusone:poll-snmp` | Takes a monitoring sample now (the same as *Poll all devices now*). |
| `sudo radiusone-root-artisan radiusone:poll-olts` | Reads the OLTs that are due. |
| `sudo radiusone-root-artisan radiusone:admin-alerts` | Runs the alert checks once. |
| `sudo radiusone-root-artisan radiusone:reset-password [login] [--reset-2fa]` | New portal password for an operator (lists logins without one). |
| `sudo radiusone-root-artisan license:check-in --force` | Registers with the PingOmni account now. |

### Network

| Command | What it does |
| --- | --- |
| `sudo radiusone-root-artisan radiusone:mark-nas-applied --auto` | Records every NAS saved before FreeRADIUS last started as in effect. |
| `sudo radiusone-root-artisan radiusone:mark-nas-applied --id=3 --revision=7 --evidence="restarted by hand"` | Records one NAS revision as in effect (sends nothing to the network). |
| `sudo radiusone-root-artisan radiusone:process-network-operations` | Sends queued network operations now. |
| `sudo radiusone-nas-diag log` | FreeRADIUS's connection errors, login results and firewall drops (no usernames or passwords). |
| `sudo radiusone-firewall off` | Removes the RadiusOne firewall rules, from the console. |
| `sudo radiusone-firewall apply` | Applies the rules in force and waits for the portal to confirm. |
| `sudo radiusone-root-artisan radiusone:firewall sync` | Brings the `routers` list and timed rules up to date. |

### Backups and data

| Command | What it does |
| --- | --- |
| `sudo RADIUSONE_OPERATOR_ENV_FILE=/etc/radiusone/backup.env radiusone-root-artisan radiusone:backup` | Backup now, with uploads. `--no-upload` writes only the local copies. |
| `sudo radiusone-root-artisan radiusone:backup-decrypt <file.enc> [--out=<file>]` | Decrypts a downloaded remote copy (asks for the passphrase). |
| `sudo RADIUSONE_OPERATOR_ENV_FILE=/etc/radiusone/migration.env radiusone-root-artisan radiusone:restore <file.sql.gz>` | Replaces the database with a backup. |
| `sudo radiusone-root-artisan radiusone:prune-radius [--max-seconds=600]` | Applies the data retention periods now. |
| `sudo radiusone-root-artisan radiusone:prune-job-runs [--days=30]` | Deletes old job history. |
| `sudo radiusone-root-artisan radiusone:document-inventory` | Compares stored customer documents with their database records (finds missing or orphaned files). |

### Upgrades and maintenance

| Command | What it does |
| --- | --- |
| `sudo radiusone-update [--check \| vX.Y.Z \| --move]` | Checks for, or installs, a release; `--move` moves a pre-2.3 server. |
| `sudo radiusone-root-artisan radiusone:check-schema` | Lists database migrations a feature still needs (exit 1 when any). |
| `sudo RADIUSONE_OPERATOR_ENV_FILE=/etc/radiusone/migration.env radiusone-root-artisan radiusone:migrate` | Applies pending database migrations. |
| `sudo radiusone-root-artisan radiusone:encrypt-secrets` | Encrypts stored credentials or re-keys them after an `APP_KEY` change (exit 2: some do not open with the current key). |
| `sudo radiusone-set-timezone apply Europe/Tirane` | Changes the time zone and converts stored times. |
| `sudo bash ops/radiusone-postinstall` | Re-installs the root helpers. |
| `sudo bash ops/radiusone-upgrade-2.3 --dry-run` | Shows what the 2.3 move would change. |
| `sudo radiusone-root-artisan radiusone:bootstrap-operator --create-first-superadmin` | Creates the first superadmin on an empty install, from JSON on stdin `{"username":..,"name":..,"email":..,"password":..}`. |
| `sudo radiusone-root-artisan radiusone:seed --demo` | Adds demo customers, plans and NAS devices to a **test** install (keeps existing records). |

Commands from before 2.3 (`frweb:...`) still work as aliases.

### FreeRADIUS by hand

```bash
sudo freeradius -C                          # check the configuration
sudo systemctl status freeradius            # is it running?
sudo tail -f /var/log/freeradius/radius.log # logins and errors as they happen

# Test a login from the server itself, if /etc/freeradius/3.0/clients.conf still has its default
# localhost client (secret testing123):
echo 'User-Name=jdoe,User-Password=k7Qm2vXp9LtR4a' | radclient -x 127.0.0.1 auth testing123

# Full debug output. RADIUS is DOWN for every customer while it runs: use a quiet period.
sudo systemctl stop freeradius
sudo freeradius -X
# Ctrl+C when done, then:
sudo systemctl start freeradius
```

## 29. Troubleshooting

| Symptom | What to check |
| --- | --- |
| A customer cannot connect | Clients → the customer → **Diagnostics**: account state, expiry, suspension, last login reply. Then Logs → Authentication attempts for that username. |
| `Login incorrect` for one customer | Wrong password on their router: **Reveal saved password** and compare, or set a new one. Also check *Allow this MAC only* and *NAS restriction*. |
| The customer connects but is slow | Diagnostics → *Effective plan*: are they on the expired or a data-cap slow-down plan? *Generated reply policy* shows the speed sent. |
| All customers on one router fail | NAS → Diagnostics: run the **packet test**. Most common: a wrong shared secret, the router sending from another address, or the NAS still *Waiting* for a FreeRADIUS restart. |
| A NAS shows *Waiting* | Restart FreeRADIUS (Monitoring → RADIUS server); it shows *Up to date* within a minute. |
| An address keeps sending requests (NAS list warning) | Your router sends from an address you did not enter (NAT, another interface): fix the router's `src-address` or **Add as NAS**. Unknown addresses: ignore, or block in the firewall. |
| Disconnect fails or times out | NAS → Device: CoA on and the right port; on MikroTik `/radius incoming set accept=yes`; the shared secret matches; nothing blocks UDP 3799 from this server to the router. With the API on: the API user, api-ssl on 8729 and the certificate. |
| Plan changes do not reach online customers | Network operations: the router's answer. Is `NETWORK_WORKER_ENABLED=true`? |
| Expired customers keep full speed | Is `RADIUSONE_SCHEDULE_EXPIRY_SYNC=true`? Does the plan have an *Expired service*? Monitoring → Background jobs. |
| Restart button says restarts are not enabled | `sudo bash ops/radiusone-postinstall` in the app folder (install.sh does this). |
| Messages are not arriving | Gateways: **Send test**. Notifications → History or Recent alerts: the provider's reason. Is the customer's alert box on? |
| Monitoring graphs are empty | Background jobs: is the SNMP poller running? Is SNMP set up and allowed on the NAS (community and the server's address)? |
| OLT shows no ONUs | **Test connection**; UDP 161 from this server to the OLT; the community; the OLT's ACL. |
| Billing pages say Pro | Add a licence key under Settings → License. |
| *New clients are refused* | The client limit is reached: archive former customers or a licence that covers more. |
| Cannot reach the portal after turning on the firewall | Wait one minute (the previous rules come back), or `sudo radiusone-firewall off` from the console. |
| *Check for updates* cannot reach GitHub | The server needs HTTPS to `api.github.com` and `github.com`: test with `sudo radiusone-update --check`. |
| Lost the administrator password | Another superadmin resets it under Settings → Users, or `sudo radiusone-root-artisan radiusone:reset-password admin` (`--reset-2fa` for a lost phone). |
| Scheduled jobs do not run | `cat /etc/cron.d/radiusone`, `tail /var/log/radiusone/scheduler.log`, and `sudo radiusone-root-artisan radiusone:job-status`. |
| The portal shows an error page | `tail -50 /opt/radiusone/storage/logs/laravel.log` and `sudo tail /var/log/nginx/error.log`. |
