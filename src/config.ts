// Site settings that change per deployment. Override at build time with VITE_DEMO_URL / VITE_REPO_URL / VITE_DNSONE_REPO_URL / VITE_CONTACT_EMAIL.
// The RadiusOne demo is a separate site; ?r=/login opens it at the sign-in page.
export const DEMO_URL: string = import.meta.env.VITE_DEMO_URL ?? 'https://demo-radiusone.pingomni.com/?r=/login';
// Where the RadiusOne source and installer live.
export const REPO_URL: string = import.meta.env.VITE_REPO_URL ?? 'https://github.com/n-geraldo/radiusone';
// Where the DNSOne source and runbook live.
export const DNSONE_REPO_URL: string = import.meta.env.VITE_DNSONE_REPO_URL ?? 'https://github.com/n-geraldo/dnsone';
export const CONTACT_EMAIL: string = import.meta.env.VITE_CONTACT_EMAIL ?? 'hello@pingomni.com';

export const mailto = (subject: string) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;

