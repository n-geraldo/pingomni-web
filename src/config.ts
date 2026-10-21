// Site settings that change per deployment. Override at build time with VITE_DEMO_URL / VITE_CONTACT_EMAIL.
export const DEMO_URL: string = import.meta.env.VITE_DEMO_URL ?? 'http://10.4.100.101:8090/';
export const CONTACT_EMAIL: string = import.meta.env.VITE_CONTACT_EMAIL ?? 'hello@pingomni.com';

export const mailto = (subject: string) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
