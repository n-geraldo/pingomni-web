import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ComingSoon from './pages/ComingSoon';
import Home from './pages/Home';
import RadiusOne from './pages/RadiusOne';
import Tools from './pages/Tools';
import { Layout, type PageId } from './shared/Layout';
import './site.css';

// Every page is its own HTML file (index.html, radiusone/index.html, ...) that names itself in data-page.
const el = document.getElementById('root')!;
const page = (el.dataset.page ?? 'home') as PageId;
// Each HTML file says how far it sits below the site root.
const root = el.dataset.root ?? (page === 'home' ? './' : '../');

const PAGES: Record<PageId, () => React.ReactNode> = {
    home: () => <Home />,
    radiusone: () => <RadiusOne />,
    ticketone: () => <ComingSoon brand="ticketone" />,
    dnsone: () => <ComingSoon brand="dnsone" />,
    'tools-network': () => <Tools group="network" />,
    'tools-email': () => <Tools group="email" />,
};

createRoot(el).render(
    <StrictMode>
        <Layout page={page} root={root}>
            {PAGES[page]()}
        </Layout>
    </StrictMode>,
);
