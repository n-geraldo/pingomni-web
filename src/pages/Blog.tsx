import { useEffect } from 'react';
import { useSite } from '../shared/Layout';

// The blog: articles come from Holo's embed, which fills #holo-blog and opens a post at ?post=<slug>.
// The script is added after hydration, so React never sees the nodes it writes.
const EMBED = 'https://prod-api-holo-ai.fly.dev/public/seo/embed/5449e82f-13f6-4967-b441-b95cb0c25d01.js';

export default function Blog() {
    const { root } = useSite();
    useEffect(() => {
        if (document.querySelector(`script[src="${EMBED}"]`)) return;
        const s = document.createElement('script');
        s.src = EMBED;
        s.defer = true;
        document.body.appendChild(s);
    }, []);
    return (
        <>
            <section className="stage docs-hero" aria-labelledby="hero-title">
                <div className="container docs-hero-inner">
                    <p className="docs-crumbs">
                        <a href={root}>PingOmni</a>
                    </p>
                    <h1 id="hero-title" className="display">
                        Blog
                    </h1>
                    <p className="lead">News and articles from PingOmni about running ISP networks, RADIUS, DNS and monitoring.</p>
                </div>
            </section>
            <section className="docs-page">
                <div className="container">
                    <div id="holo-blog" />
                </div>
            </section>
        </>
    );
}
