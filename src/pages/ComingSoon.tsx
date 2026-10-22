import { Mark, Wordmark } from '../brand';
import { mailto } from '../config';
import Icon from '../Icon';
import { useSite } from '../shared/Layout';

// Products that are not out yet: what they are for, an honest status, and a way to hear when they are ready.
const PRODUCTS = {
    ticketone: { name: 'TicketOne', job: 'Support tickets for ISP help desks.' },
    dnsone: { name: 'DNSOne', job: 'DNS for ISPs and network operators.' },
} as const;

export default function ComingSoon({ brand }: { brand: keyof typeof PRODUCTS }) {
    const { root } = useSite();
    const product = PRODUCTS[brand];
    return (
        <section className="stage soon-hero" aria-labelledby="hero-title">
            <div className="container soon">
                <div className="tile-head">
                    <Mark brand={brand} size={52} className="ping-on-load" />
                    <span className="product-name">
                        <Wordmark brand={brand} />
                    </span>
                    <span className="badge badge-warning">Coming soon</span>
                </div>
                <h1 id="hero-title" className="display">
                    {product.job}
                </h1>
                <p className="lead">
                    {product.name} is the next product in the PingOmni family. It is still in planning, so its features and release date are
                    not set yet. Like RadiusOne, it will be self-hosted and share the same look and operator roles.
                </p>
                <div className="actions">
                    <a className="btn btn-primary btn-lg" href={mailto(`Tell me when ${product.name} is ready`)}>
                        <Icon name="mail" />
                        Tell me when it’s ready
                    </a>
                    <a className="btn btn-lg btn-ghost" href={mailto(`Ideas for ${product.name}`)}>
                        Tell us what you need
                    </a>
                </div>
                <div className="soon-next">
                    <Mark brand="radiusone" size={36} />
                    <p>
                        Available now: <strong>RadiusOne</strong>, the ISP back office on FreeRADIUS.
                    </p>
                    <a className="text-link" href={`${root}radiusone/`}>
                        See RadiusOne
                        <Icon name="arrow" />
                    </a>
                </div>
            </div>
        </section>
    );
}
