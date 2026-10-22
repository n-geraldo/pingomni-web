import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import App from './App';
import type { PageId } from './shared/Layout';
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './site.css';

// Every page is its own HTML file (index.html, radiusone/index.html, ...) that names itself in data-page
// and says how far it sits below the site root. The build pre-renders each one; here it comes to life.
const el = document.getElementById('root')!;
const page = (el.dataset.page ?? 'home') as PageId;
const root = el.dataset.root ?? (page === 'home' ? './' : '../');
const app = (
    <StrictMode>
        <App page={page} root={root} />
    </StrictMode>
);

if (el.firstElementChild) hydrateRoot(el, app);
else createRoot(el).render(app);
