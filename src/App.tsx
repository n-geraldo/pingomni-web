import DNSOne from './pages/DNSOne';
import { DocsGuide, DocsHub } from './pages/Docs';
import { HowTo } from './pages/Guides';
import Home from './pages/Home';
import Legal from './pages/Legal';
import Monitor from './pages/Monitor';
import NotFound from './pages/NotFound';
import RadiusOne from './pages/RadiusOne';
import Tools from './pages/Tools';
import { Layout, type PageId } from './shared/Layout';

const PAGES: Record<PageId, () => React.ReactNode> = {
    home: () => <Home />,
    monitor: () => <Monitor />,
    radiusone: () => <RadiusOne />,
    dnsone: () => <DNSOne />,
    docs: () => <DocsHub />,
    'docs-radiusone': () => <DocsGuide product="radiusone" />,
    'docs-dnsone': () => <DocsGuide product="dnsone" />,
    'guide-mikrotik-pppoe': () => <HowTo id="mikrotik-pppoe-freeradius" />,
    'guide-rpz-powerdns': () => <HowTo id="rpz-ad-blocking-powerdns" />,
    'tools-network': () => <Tools group="network" />,
    'tools-email': () => <Tools group="email" />,
    'tools-bgp': () => <Tools group="bgp" />,
    terms: () => <Legal id="terms" />,
    privacy: () => <Legal id="privacy" />,
    notfound: () => <NotFound />,
};

// One page of the site; the same tree is rendered to HTML at build time and hydrated in the browser.
export default function App({ page, root }: { page: PageId; root: string }) {
    return (
        <Layout page={page} root={root}>
            {PAGES[page]()}
        </Layout>
    );
}
