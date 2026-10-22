import ComingSoon from './pages/ComingSoon';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import RadiusOne from './pages/RadiusOne';
import Tools from './pages/Tools';
import { Layout, type PageId } from './shared/Layout';

const PAGES: Record<PageId, () => React.ReactNode> = {
    home: () => <Home />,
    radiusone: () => <RadiusOne />,
    ticketone: () => <ComingSoon brand="ticketone" />,
    dnsone: () => <ComingSoon brand="dnsone" />,
    'tools-network': () => <Tools group="network" />,
    'tools-email': () => <Tools group="email" />,
    'tools-bgp': () => <Tools group="bgp" />,
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
