// Site settings that change per deployment. Override at build time with VITE_DEMO_URL / VITE_CONTACT_EMAIL.
// The RadiusOne demo is served by this site at /radiusone/demo/ (see deploy/nginx.conf).
export const DEMO_URL: string = import.meta.env.VITE_DEMO_URL ?? '/radiusone/demo/';
export const CONTACT_EMAIL: string = import.meta.env.VITE_CONTACT_EMAIL ?? 'hello@pingomni.com';

export const mailto = (subject: string) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;

// Where "our server" tests run, shown before a test starts (results carry the API's own value). VITE_SERVER_LOCATION overrides.
export const SERVER_LOCATION: string = import.meta.env.VITE_SERVER_LOCATION ?? 'Albania';
