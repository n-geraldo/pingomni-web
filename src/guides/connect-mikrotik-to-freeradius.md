# How to connect MikroTik PPPoE to FreeRADIUS

This guide connects a MikroTik router to a plain FreeRADIUS server, with one test user. You need an Ubuntu
24.04 server, a MikroTik router on RouterOS 7, and root on both. The examples use `192.0.2.10` for the
FreeRADIUS server, `192.0.2.1` for the router and `100.64.0.0/22` for customer addresses.

## Contents

1. [Install FreeRADIUS](#1-install-freeradius)
2. [Add the router as a client](#2-add-the-router-as-a-client)
3. [Create a test user](#3-create-a-test-user)
4. [Open the firewall](#4-open-the-firewall)
5. [Set up the MikroTik](#5-set-up-the-mikrotik)
6. [Check the first login](#6-check-the-first-login)
7. [Disconnect a session](#7-disconnect-a-session)
8. [Troubleshooting](#8-troubleshooting)
9. [Where to go next](#9-where-to-go-next)

---

## 1. Install FreeRADIUS

```
apt-get update
apt-get install -y freeradius freeradius-utils
systemctl enable --now freeradius
```

On Ubuntu the settings are in `/etc/freeradius/3.0/`.

## 2. Add the router as a client

FreeRADIUS answers only the clients it knows. Add this to `/etc/freeradius/3.0/clients.conf`, with a long
random secret:

```
client mikrotik-1 {
    ipaddr = 192.0.2.1
    secret = THE-SHARED-SECRET
}
```

`ipaddr` must be the address the router sends RADIUS from. FreeRADIUS reads this file when it starts, so you
restart it in the next step.

## 3. Create a test user

Add this at the top of `/etc/freeradius/3.0/users`. The second line must be indented:

```
alice   Cleartext-Password := "a-long-password"
        Mikrotik-Rate-Limit = "20M/100M"
```

`Mikrotik-Rate-Limit` is upload first, then download: here 20 Mbps up and 100 Mbps down. Then check the
configuration, restart and test from the server itself:

```
freeradius -CX | tail -1
systemctl restart freeradius
radtest alice a-long-password 127.0.0.1 0 testing123
```

`testing123` is the default secret for clients on the server itself. The answer should include
`Received Access-Accept` and the speed limit. Change that default secret if other people can log in to
this server.

## 4. Open the firewall

If `ufw` is active on the server, let in only the router:

```
ufw allow from 192.0.2.1 to any port 1812,1813 proto udp
```

UDP 1812 carries logins and UDP 1813 carries accounting. Do not open these ports to everyone.

## 5. Set up the MikroTik

With `ether2` towards your customers:

```
/ip pool add name=pppoe-pool ranges=100.64.0.10-100.64.3.250
/ppp profile add name=radius-pppoe local-address=100.64.0.1 dns-server=192.0.2.53
/interface pppoe-server server add service-name=isp interface=ether2 default-profile=radius-pppoe \
    authentication=pap,chap,mschap2 one-session-per-host=yes disabled=no
/radius add service=ppp address=192.0.2.10 secret="THE-SHARED-SECRET" src-address=192.0.2.1 timeout=3s
/ppp aaa set use-radius=yes accounting=yes interim-update=1m
/radius incoming set accept=yes port=3799
```

- `src-address` must match `ipaddr` in `clients.conf`.
- `interim-update=1m` sends usage for running sessions every minute.
- `/radius incoming` lets a RADIUS server disconnect sessions. See step 7.

If the router's own firewall drops input by default, allow UDP 3799 from `192.0.2.10`.

## 6. Check the first login

Connect a test router or PC as a PPPoE client, with the username `alice` and the password above. Then, on the MikroTik:

```
/ppp active print
/queue simple print
/log print where topics~"radius"
```

The first command shows the session, and the second shows its speed limit. To watch the decision on the
server, stop the service and run it in the foreground. It keeps answering logins, but only while it runs:

```
systemctl stop freeradius
freeradius -X
```

Press Ctrl+C when you have finished, then run `systemctl start freeradius`.

## 7. Disconnect a session

A change on the server does not touch a session that is already running. To end one, send the router a RADIUS
Disconnect-Request from the server:

```
cat <<EOF | radclient -x 192.0.2.1:3799 disconnect 'THE-SHARED-SECRET'
User-Name = "alice"
Acct-Session-Id = "THE-SESSION-ID"
NAS-IP-Address = "192.0.2.1"
EOF
```

Take `Acct-Session-Id` from the `Acct-Session-Id` line that `freeradius -X` prints, or from the `radacct` table
if you record sessions in SQL. RouterOS accepts the request only from a server listed under `/radius`, signed
with its secret. An answer of `Disconnect-ACK` means the session has ended.

## 8. Troubleshooting

| What you see | What to check |
| --- | --- |
| `radius timeout` on the router | The server's address, the firewall, and whether `freeradius` is running |
| `unknown client` in `freeradius -X` | `ipaddr` does not match the address the router sends from. Check `src-address` |
| Requests are ignored or the password always fails | The secret is different on the two sides |
| `Access-Reject` | The username or password, and the order of entries in `users` |
| The login works but the speed limit does not | The second line in `users` is not indented, or the plan's value is wrong |
| The customer's PPPoE client cannot log in | The `authentication` methods on the PPPoE server, and whether the password is stored as plain text |
| `Disconnect-NAK`, or no answer | `/radius incoming`, UDP 3799 on the router, and the session ID |

## 9. Where to go next

A text file does not scale past a few test users. The next step is the SQL module, which keeps users, plans
and sessions in a database. Then you need billing: see
[FreeRADIUS billing for a small ISP](/guides/freeradius-billing-for-isps/).

If you would rather not build that part, [RadiusOne](/radiusone/) sets up FreeRADIUS with its database and
gives you the portal. The steps are in
[MikroTik PPPoE subscribers with RadiusOne](/guides/mikrotik-pppoe-freeradius/).
