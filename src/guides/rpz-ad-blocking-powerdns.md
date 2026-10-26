# How to block ads and malware for ISP customers with DNSOne

You need DNSOne running as your customers' resolver: installing it is in the
[installation runbook](https://github.com/Pingomni/dnsone/blob/main/docs/RUNBOOK.md) (eight chapters,
each ending with checks). Sign in as an administrator. The examples use `192.0.2.53` for the resolver
and `10.20.0.0/16` for customer networks.

## Contents

1. [Let your customers use the resolver](#1-let-your-customers-use-the-resolver)
2. [Subscribe to blocklists](#2-subscribe-to-blocklists)
3. [Choose what a blocked name answers](#3-choose-what-a-blocked-name-answers)
4. [Check a domain](#4-check-a-domain)
5. [Fix false positives](#5-fix-false-positives)
6. [Business, family and the rest: client groups](#6-business-family-and-the-rest-client-groups)
7. [Pause blocking](#7-pause-blocking)
8. [Test it from a customer line](#8-test-it-from-a-customer-line)
9. [Good to know](#9-good-to-know)

---

## 1. Let your customers use the resolver

Only addresses in your customer networks may use DNSOne as a resolver, so it never becomes an open
resolver; everyone else only gets answers for the zones you host.

1. Open **Settings → DNS server**.
2. In **Customer networks**, list your customer ranges, one per line (here `10.20.0.0/16`, plus your
   public and CGNAT pools).
3. In **NAT addresses**, list your CGNAT gateways: they carry many homes, so they get a higher rate
   limit than a single customer address.
4. Save.

Then hand the resolver's address to customers as the DNS server of your PPPoE profile or DHCP server
(on MikroTik, `dns-server=192.0.2.53` in the PPP profile). With
[RadiusOne](https://pingomni.com/radiusone/), that one profile serves every PPPoE subscriber.

## 2. Subscribe to blocklists

1. Open **Ad-blocking → Lists → Add a list**.
2. A **Name** (for example *StevenBlack ads and malware*) and the list's **URL**, for example
   `https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts`.
3. **Format** *Detect automatically*: hosts files (`0.0.0.0 domain`), one domain per line and Adblock
   rules (`||domain^`) are all read.
4. **Kind** *Blocklist: block these names*.
5. Under **Used by**, tick the client groups that use it (*Default* is everyone not in a group), and
   keep **Use this list** on. Save.

DNSOne downloads every list every 6 hours. A failed or empty download keeps the previous copy, so a
list host that is down never empties your blocking. The Lists tab shows the **Last build**, the
**Blocked names (triggers)** and the **Serial loaded in the Recursor**.

> An **allowlist** is added the same way, with **Kind** *Allowlist: never block these names*.
> Allowlists win over blocklists.

## 3. Choose what a blocked name answers

Open **Ad-blocking → Block policy** and pick the **Answer for blocked names**:

| Answer | Customer sees |
|---|---|
| Does not exist (NXDOMAIN, the default) | The ad or tracker simply does not load |
| No data | The name exists but has no address |
| Null IP (0.0.0.0 / ::) | The connection fails at once |
| Redirect to your page (walled garden) | A page of yours explaining the block |

Leave **Subdomains of blocked names** on, so `ads.example.com` also blocks `x.ads.example.com`, and
press **Save policy**. Changes reach customers within about a minute: blocked answers are cached for at
most 60 seconds.

## 4. Check a domain

**Ad-blocking → Check a domain** answers the question support gets most: *is this name blocked, and by
which list or rule?* Type the **Domain**, choose the group under **For clients in** (*Default* for
most customers), and press **Check**. To find a customer's group from their address, use **Client
groups → Which group is a client in?**

## 5. Fix false positives

Every list blocks something a customer needs sooner or later. When one calls:

1. **Check a domain** to see which list or rule blocks it.
2. **Ad-blocking → Rules → Add rule**: the **Domain**, **Action** *Allow*, and **Applies to** every group
   or just one. A group's own rule wins over a rule for every group.
3. Save. The name works within a minute, without waiting for the next list download.

Rules can also **block** a single domain (and everything below it), or match a regex. **Import list**
adds up to 50,000 domains at once, one per line.

## 6. Business, family and the rest: client groups

Business customers usually want no blocking; some homes want a family filter on top. Open **Client
groups**:

1. **New group** *Business*: put its networks or single addresses in **One address or subnet per
   line**, and switch **Ad-blocking on for these clients** off.
2. **New group** *Family*: its networks, ad-blocking on, and if you want:
   - **Safe Search**: Google, Bing and DuckDuckGo always filter explicit results;
   - **YouTube**: restricted mode, moderate or strict.

   Then add an adult-content list under **Ad-blocking → Lists**, used by *Family* only.
3. Everyone not in a group is in **Default**, with the lists from step 2.

A customer belongs to the group of its **most specific** network, so one address in *Business* wins
over the /16 in Default.

## 7. Pause blocking

The **Pause blocking** panel on Ad-blocking stops blocking for everyone or for one group, for a number
of minutes or until **Resume**. Use it to check whether a problem a customer reports is caused by
blocking at all; it resumes by itself. Safe Search stays on while blocking is paused.

## 8. Test it from a customer line

From a computer on a customer network:

```
dig @192.0.2.53 doubleclick.net A +noall +comments | grep -E 'status|EDE'
dig @192.0.2.53 x.doubleclick.net A +short
```

- The first shows `status: NXDOMAIN` and `EDE: 15 (Blocked): (Blocked by DNSOne)`.
- The second returns nothing: subdomains are blocked too.

In the console, the **Dashboard** shows the blocked queries of the last 24 hours, and the **Query log**
(if your server keeps one) lists each blocked query with the client that asked.

## 9. Good to know

- **Tell customers.** Say on your website that the resolver blocks ads and malware and how to ask for a
  name to be unblocked. Offering it per group avoids most complaints.
- **Encrypted DNS.** Browsers using DNS over HTTPS to a public resolver skip yours. DNSOne answers DNS
  over TLS (port 853) and DNS over HTTPS (`https://<name>/dns-query`) itself when the server has a
  certificate, so those customers stay protected.
- **Court-ordered blocking** is separate, under **Court orders**: it applies to every customer and every
  group, ahead of allow rules and pauses, and keeps a record for the regulator.

The full reference is the [DNSOne user guide](https://pingomni.com/docs/dnsone/). To try the console on
sample data first, open the [live demo](https://demo-dns.pingomni.com/) and sign in as demo / demo.
