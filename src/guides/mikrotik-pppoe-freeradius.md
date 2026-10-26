# How to set up MikroTik PPPoE subscribers with RadiusOne

You need an Ubuntu 24.04 server for RadiusOne (2 CPU cores, 4 GB RAM and 20 GB disk are enough to
start), a MikroTik router on RouterOS 7, and root on the server. The examples use `192.0.2.10` for the
RadiusOne server, `192.0.2.1` for the router and `100.64.0.0/22` for customer addresses.

## Contents

1. [Install RadiusOne](#1-install-radiusone)
2. [Sign in and set the basics](#2-sign-in-and-set-the-basics)
3. [Add the MikroTik as a NAS](#3-add-the-mikrotik-as-a-nas)
4. [Set up the router](#4-set-up-the-router)
5. [Create a service plan](#5-create-a-service-plan)
6. [Add a client](#6-add-a-client)
7. [Check the first login](#7-check-the-first-login)
8. [Disconnect, suspend and renew](#8-disconnect-suspend-and-renew)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Install RadiusOne

On the server, as root:

```
apt-get install -y git
git clone https://github.com/n-geraldo/radiusone /opt/radiusone
cd /opt/radiusone
bash install.sh --domain radius.example.com --email it@example.com --timezone Europe/Tirane
```

- `--domain` and `--email` get a trusted Let's Encrypt certificate (the name must already point at the
  server). Without them the portal runs on the server's IP with a self-signed certificate.
- Set `--timezone` now: billing dates and expiry times follow it.

The installer sets up everything in a few minutes: the web portal, MariaDB, FreeRADIUS connected to
the database, HTTPS, nightly backups and the scheduled jobs. If `ufw` is active it opens 80, 443,
1812/udp and 1813/udp. It ends with a summary:

```
==> RadiusOne is installed.
    freeradius     running
    login page     HTTP 200
    Portal:    https://radius.example.com
    Username:  admin
    Password:  6f1c0e9a2b7d4c8e5a3f1b90
```

> **Warning:** the password is shown only once. Save it before you close the terminal.

## 2. Sign in and set the basics

1. Open the portal address and sign in with the username and password from the summary.
2. Set up **two-factor authentication**: scan the QR code with an authenticator app and enter the
   6-digit code.
3. Under **Settings**, set your company name and logo (*Branding*), currency and time zone
   (*Regional*), and, if you want customer messages, an email or SMS gateway (*Notifications*).

## 3. Add the MikroTik as a NAS

RADIUS answers only the routers listed in the portal.

1. Open **NAS Devices → New NAS device**.
2. Platform **MikroTik RouterOS**, a name, and the router's IP address as RADIUS sees it (the address it
   sends RADIUS from), here `192.0.2.1`.
3. A long random **RADIUS shared secret**. You type the same secret on the router in the next step.
4. Leave **Disconnect sessions with RADIUS (CoA)** on, port 3799.
5. Save.
6. Open **Monitoring → RADIUS server** and press **Restart** next to FreeRADIUS. FreeRADIUS reads the
   NAS list only when it starts; until then the NAS shows *waiting for FreeRADIUS restart*. Within a
   minute it shows as up to date.

## 4. Set up the router

The NAS page's **Router setup** tab lists the steps for its platform. On the MikroTik (RouterOS 7), with
`ether2` towards your customers:

```
/ip pool add name=pppoe-pool ranges=100.64.0.10-100.64.3.250
/ppp profile add name=radius-pppoe local-address=100.64.0.1 dns-server=192.0.2.53
/interface pppoe-server server add service-name=isp interface=ether2 default-profile=radius-pppoe \
    authentication=pap,chap,mschap2 one-session-per-host=yes disabled=no
/radius add service=ppp address=192.0.2.10 secret="THE-SHARED-SECRET" src-address=192.0.2.1 timeout=3s
/ppp aaa set use-radius=yes accounting=yes interim-update=1m
/radius incoming set accept=yes port=3799
```

- `src-address` must be the address you saved for the NAS in the portal.
- `interim-update=1m` keeps the sessions on the client pages and in Monitoring fresh.
- `/radius incoming` lets the portal's **Disconnect** button reach the router. RouterOS accepts it only
  from the servers listed under `/radius`, signed with the shared secret.
- Remember the pool name (`pppoe-pool`): the plan names it in the next step.

Optional, on the same NAS page: the **SNMP** tab for CPU, memory and traffic graphs in Monitoring
(it shows the RouterOS command to paste), and the **API** tab for RouterOS API access over api-ssl.

## 5. Create a service plan

1. Open **Services → New plan**.
2. **Name** (for example *Home 100*) and **RADIUS group name**.
3. **Customer download (Mbps)** `100` and **Customer upload (Mbps)** `20`. RadiusOne writes the
   MikroTik speed limit for you, in the order RouterOS expects.
4. **IP behavior** *Dynamic pool* and **IP pool name** `pppoe-pool`, the pool on the router.
5. **Price** and, if you want, a **Data cap per cycle (GB)**.
6. The **expired service** plan clients move to when their end date passes (for example a plan that
   sends them to a payment page).
7. Save.

For fixed addresses, list the addresses you sell under **Services → Static IP pools** (ranges like
`192.0.2.10-20` or small CIDRs), with a monthly price; a client form then offers the free ones.

## 6. Add a client

1. Open **Clients → New client**.
2. **Identity and contact**: name, phone and email. Tick **SMS alert** / **Email alert** only if the
   customer agreed to messages.
3. **Credentials**: the PPPoE **Username** and **PPPoE password** their router will use.
4. **Service and status**: the **Service plan** (*Home 100*) and the **Expiry date**.
5. Save. The account can connect straight away; no restart is needed for clients or plans.

Put the same username and password in the customer's router (PPPoE client), or give them to the
customer.

## 7. Check the first login

- On the client's page, **Overview** shows the current session: address, NAS and traffic.
- **Diagnostics** explains a failed login: account state, plan, the last login attempts and the
  router's replies.
- **Logs → Authentication attempts** lists every accepted and rejected login.
- The **Dashboard** shows online clients, each NAS's status and recent rejects.
- On the MikroTik, `/ppp active print` shows the session and `/queue simple print` its speed limit.

## 8. Disconnect, suspend and renew

- **Disconnect** on the client page sends a RADIUS Disconnect-Request (CoA) to the router and shows its
  answer at once. The customer's router dials again straight away and gets their current plan, which
  is how a plan change takes effect immediately.
- **Suspend** blocks the account until you lift it. A payment never lifts a manual or security
  suspension.
- When the expiry date passes, RadiusOne moves the client to the plan's expired service. With the
  network worker on, an online client is disconnected too, so they come back with the expired
  behaviour at once; otherwise at their next login.
- **Billing → Record payment** on an invoice extends the end date when a renewal is paid in full.

## 9. Troubleshooting

| What you see | What to check |
|---|---|
| The router says the RADIUS server is not responding | UDP 1812/1813 from the router to the server; the router's `src-address` matches the NAS address in the portal; FreeRADIUS restarted after adding the NAS. |
| The NAS shows *waiting for FreeRADIUS restart* | Monitoring → RADIUS server → Restart next to FreeRADIUS. |
| A client is rejected | Clients → the client → Diagnostics: account state, expiry date and the last replies. Then Logs → Authentication attempts. |
| Every client on one router fails | The shared secret on the router and on the NAS page differ. |
| Connected, but no address | IP pool name in the plan is not the pool on the router, or the pool is full. |
| Disconnect fails or times out | NAS page: CoA on, port 3799; on the router `/radius incoming set accept=yes port=3799`; UDP 3799 to the router open. |

The full reference for every page is the [RadiusOne user guide](https://pingomni.com/docs/radiusone/).
To see the portal first, open the [live demo](https://demo-radiusone.pingomni.com/?r=/login) and sign
in as demo / demo.
