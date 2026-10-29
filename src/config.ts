// Site settings that change per deployment. Override at build time with VITE_DEMO_URL / VITE_REPO_URL / VITE_DNSONE_DEMO_URL / VITE_DNSONE_REPO_URL / VITE_ACCOUNT_URL / VITE_MONITOR_URL / VITE_CONTACT_EMAIL.
// The RadiusOne demo is a separate site; ?r=/login opens it at the sign-in page.
export const DEMO_URL: string = import.meta.env.VITE_DEMO_URL ?? 'https://demo-radiusone.pingomni.com/?r=/login';
// Where the RadiusOne source and installer live.
export const REPO_URL: string = import.meta.env.VITE_REPO_URL ?? 'https://github.com/n-geraldo/radiusone';
// The DNSOne demo, its own site.
export const DNSONE_DEMO_URL: string = import.meta.env.VITE_DNSONE_DEMO_URL ?? 'https://demo-dns.pingomni.com/';
// Where the DNSOne source and runbook live.
export const DNSONE_REPO_URL: string = import.meta.env.VITE_DNSONE_REPO_URL ?? 'https://github.com/Pingomni/dnsone';
// The customers' portal: licences, orders and invoices (account.pingomni.com).
export const ACCOUNT_URL: string = import.meta.env.VITE_ACCOUNT_URL ?? 'https://account.pingomni.com';
// PingOmni Monitor, the hosted monitoring service.
export const MONITOR_URL: string = import.meta.env.VITE_MONITOR_URL ?? 'https://mon.pingomni.com';
export const CONTACT_EMAIL: string = import.meta.env.VITE_CONTACT_EMAIL ?? 'hello@pingomni.com';

export const mailto = (subject: string) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
// Buying a product: PingOmni Account's sign-up for it. New visitors create an account and land on the product's plans;
// someone who has an account signs in from there, and a signed-in visitor goes straight to the plans.
// A plan's button names the plan and the period, so PingOmni Account opens checkout with it chosen after sign-up or sign-in.
export const buyUrl = (product: 'radiusone' | 'dnsone' | 'monitor', plan?: string, yearly?: boolean) =>
    `${ACCOUNT_URL}/register?${new URLSearchParams({ product, ...(plan ? { plan } : {}), ...(plan && yearly !== undefined ? { period: yearly ? '12' : '1' } : {}) })}`;
