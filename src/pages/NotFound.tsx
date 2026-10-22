import Icon from '../Icon';
import { TOOL_PAGES } from '../lib/toolList';
import { useSite } from '../shared/Layout';

// The 404 page: served with a real 404 status by nginx, so search engines drop the address.
export default function NotFound() {
    const { root } = useSite();
    return (
        <section className="stage soon-hero" aria-labelledby="hero-title">
            <div className="container soon">
                <h1 id="hero-title" className="display">
                    This page does not exist.
                </h1>
                <p className="lead">The address may be mistyped, or the page may have moved. Most visitors are looking for one of these:</p>
                <div className="actions">
                    <a className="btn btn-primary btn-lg" href={root}>
                        PingOmni home
                    </a>
                    <a className="btn btn-lg btn-ghost" href={`${root}radiusone/`}>
                        RadiusOne
                    </a>
                    <a className="btn btn-lg btn-ghost" href={`${root}${TOOL_PAGES.network.path}`}>
                        <Icon name={TOOL_PAGES.network.icon} />
                        {TOOL_PAGES.network.title}
                    </a>
                    <a className="btn btn-lg btn-ghost" href={`${root}${TOOL_PAGES.email.path}`}>
                        <Icon name={TOOL_PAGES.email.icon} />
                        {TOOL_PAGES.email.title}
                    </a>
                </div>
            </div>
        </section>
    );
}
