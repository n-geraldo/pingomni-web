# FreeRADIUS billing for a small ISP: what you need to add

FreeRADIUS decides who may connect and records their sessions. It does not know what a customer owes.
This guide shows what it already gives you, what billing has to add, and how to cut off an unpaid
customer properly. The SQL examples use the standard FreeRADIUS 3 schema.

## Contents

1. [What FreeRADIUS does and does not do](#1-what-freeradius-does-and-does-not-do)
2. [The tables you already have](#2-the-tables-you-already-have)
3. [What billing has to add](#3-what-billing-has-to-add)
4. [Stopping service when a customer has not paid](#4-stopping-service-when-a-customer-has-not-paid)
5. [Build it or use a panel](#5-build-it-or-use-a-panel)
6. [Billing in RadiusOne](#6-billing-in-radiusone)
7. [Before you bill real customers](#7-before-you-bill-real-customers)

---

## 1. What FreeRADIUS does and does not do

| FreeRADIUS does | FreeRADIUS does not do |
| --- | --- |
| Checks the username and password | Keep customer records such as an address or a phone number |
| Sends the router the speed limit and IP settings | Create invoices or number them |
| Records sessions and traffic (accounting) | Record payments, in cash or otherwise |
| Logs accepted and rejected logins | Decide that an invoice is overdue |

So billing is a separate layer. It reads and writes the same database that FreeRADIUS uses, and it does
not have to sit in the login path. If the billing panel stops, customers can still connect.

## 2. The tables you already have

With the SQL module on, FreeRADIUS reads these tables:

| Table | What it holds |
| --- | --- |
| `radcheck` | Per-user checks, such as the password |
| `radreply` | Per-user reply attributes, such as a fixed IP address |
| `radusergroup` | Which group, or plan, each user belongs to |
| `radgroupcheck` | Checks for a whole group |
| `radgroupreply` | Reply attributes for a whole group, such as the speed limit |
| `radacct` | Sessions: start, stop, address and traffic |
| `radpostauth` | Accepted and rejected login attempts |
| `nas` | The routers allowed to ask, if clients are read from SQL |

A plan is a group. This puts a customer on a plan with 100 Mbps down and 20 Mbps up on MikroTik:

```
INSERT INTO radcheck (username, attribute, op, value)
VALUES ('alice', 'Cleartext-Password', ':=', 'a-long-password');

INSERT INTO radusergroup (username, groupname, priority)
VALUES ('alice', 'home-100', 1);

INSERT INTO radgroupreply (groupname, attribute, op, value)
VALUES ('home-100', 'Mikrotik-Rate-Limit', ':=', '20M/100M');
```

`Mikrotik-Rate-Limit` is upload first, then download. To connect the router itself, see
[how to connect MikroTik PPPoE to FreeRADIUS](/guides/connect-mikrotik-to-freeradius/).

## 3. What billing has to add

- **Customers:** name, contact details and the username they connect with.
- **Plans with a price:** each group gets a price and a billing period.
- **Service end dates:** when each customer has paid until.
- **Invoices:** a new one each period, with numbers that never leave a gap.
- **Payments:** amount, date, method and reference. In many small ISPs that means cash or a bank
  transfer, so a person has to be able to record it.
- **Overdue handling:** which invoices are late, and what happens to those customers.
- **Messages:** reminders by email or SMS, only to customers who agreed to them.
- **Reports:** what is still to collect, what is overdue and what came in this month.

> **Warning:** invoice rules differ by country. Ask an accountant what your invoices must show, and
> whether they must be registered with the tax authority, before you send the first one.

## 4. Stopping service when a customer has not paid

This takes two steps, and small setups often miss the second.

1. **Stop new logins, or move the customer to a restricted plan.** Change their group in `radusergroup`.
   A common choice is an "expired" plan that limits speed or sends them to a payment page.
2. **End the session that is already running.** A change in the database does not touch a session that
   is already connected. The customer keeps the old service until the session ends, which can take
   weeks. Send the router a RADIUS Disconnect-Request (CoA), and the customer's router dials again and
   gets the new plan.

The same steps apply when a customer pays: change the plan back, then disconnect so the change takes
effect at once.

Be careful with automatic cut-offs. A customer who paid in cash this morning must not lose service
tonight because nobody has recorded the payment yet. Record payments before the job runs, and let a
person lift a block quickly.

## 5. Build it or use a panel

| | Your own scripts | A panel |
| --- | --- | --- |
| **Fits when** | You have few customers, a developer who stays, and simple billing | You want to spend your time on the network |
| **Cost** | The developer's time, for as long as you keep it | A licence, or the time to run a free tool |
| **Main risk** | The one person who understands it leaves | You depend on the vendor. Ask how you get your data out, and what stops if the licence ends |
| **Check first** | Who fixes it when billing fails at month end? | Does the invoice meet your country's rules? Does it take cash? |

Whichever you choose, keep the standard FreeRADIUS tables. That keeps your subscribers readable by other
tools if you change your mind later.

## 6. Billing in RadiusOne

[RadiusOne](/radiusone/) is our panel for this job. It installs on your own Ubuntu server and writes to the
standard FreeRADIUS SQL tables. It does not sit in the login path.

- **In every edition:** subscribers and service plans, static IPs, suspension and expiry, daily usage and
  data caps, and disconnects over RADIUS CoA or the RouterOS API. It is free for up to 150 active
  subscribers.
- **In RadiusOne Pro:** recurring invoices every night, payments with PDF receipts and overdue invoices,
  customer email and SMS, and your logo on invoices.

Payments are recorded by method, and a full payment of a renewal extends the service end date. See the
[billing chapter of the user guide](/docs/radiusone/#8-billing) and the [editions and prices](/radiusone/#editions).

## 7. Before you bill real customers

1. Create one real invoice and have your accountant check it.
2. Back up the database, and test that you can restore it.
3. Run the new billing beside your old method for one full billing period, and compare every invoice.
4. Test a cut-off and a reconnection on your own test account.
5. Decide who lifts a wrong block outside working hours.
