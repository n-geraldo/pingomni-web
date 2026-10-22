// Header, footer and contact band shared by every page, plus the theme switch.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Mark, Wordmark, type Brand } from '../brand';
import { CONTACT_EMAIL, DEMO_URL, mailto } from '../config';
import Icon from '../Icon';

export type Theme = 'light' | 'dark';
export type PageId = 'home' | 'radiusone' | 'ticketone' | 'dnsone';

// Pages live at the root (home) or one folder down (products); links and images are relative to the site root.
type Site = { page: PageId; root: string; theme: Theme };
const SiteContext = createContext<Site>({ page: 'home', root: './', theme: 'light' });
export const useSite = () => useContext(SiteContext);

function currentTheme(): Theme {
    const set = document.documentElement.dataset.theme;
    if (set === 'light' || set === 'dark') return set;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// The Products menu: what is available first, then what is coming.
const PRODUCTS: { page: Brand & PageId; href: string; job: string; soon?: boolean }[] = [
    { page: 'radiusone', href: 'radiusone/', job: 'ISP back office on FreeRADIUS' },
    { page: 'ticketone', href: 'ticketone/', job: 'Support tickets for ISP help desks', soon: true },
    { page: 'dnsone', href: 'dnsone/', job: 'DNS for ISPs and network operators', soon: true },
];

const NAV: { href: string; label: string }[] = [
    { href: '#use-cases', label: 'Use cases' },
    { href: '#about', label: 'About' },
];

function ProductsMenu({ onNavigate }: { onNavigate: () => void }) {
    const { page, root, theme } = useSite();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const close = () => {
        setOpen(false);
        onNavigate();
    };
    const current = PRODUCTS.some((p) => p.page === page);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
        window.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onClick);
        return () => {
            window.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onClick);
        };
    }, [open]);

    return (
        <div className={open ? 'nav-menu open' : 'nav-menu'} ref={ref}>
            <button
                type="button"
                className="nav-menu-btn"
                aria-expanded={open}
                aria-controls="products-menu"
                data-current={current || undefined}
                onClick={() => setOpen(!open)}
            >
                Products
                <Icon name="chevron" />
            </button>
            <div className="mega" id="products-menu">
                <div className="container mega-grid">
                    <div className="mega-feature">
                        <div className="mega-feature-head">
                            <Mark brand="radiusone" size={36} />
                            <Wordmark brand="radiusone" />
                            <span className="badge badge-success">Available</span>
                        </div>
                        <p className="mega-feature-job">The ISP back office on FreeRADIUS: subscribers, plans, billing and NAS monitoring.</p>
                        <div className="mega-feature-body">
                            <a className="mega-shot" href={`${root}radiusone/`} tabIndex={-1} aria-hidden="true" onClick={close}>
                                <img src={`${root}shots/dashboard-${theme}.jpg`} alt="" width={1800} height={1500} loading="lazy" />
                            </a>
                            <div className="mega-feature-links">
                                <a
                                    className="text-link"
                                    href={`${root}radiusone/`}
                                    aria-current={page === 'radiusone' ? 'page' : undefined}
                                    onClick={close}
                                >
                                    RadiusOne overview
                                    <Icon name="arrow" />
                                </a>
                                <a className="text-link" href={DEMO_URL} target="_blank" rel="noopener" onClick={close}>
                                    Try the demo
                                    <Icon name="external" />
                                </a>
                            </div>
                        </div>
                    </div>
                    <div className="mega-soon">
                        <p className="mega-soon-title">Coming soon</p>
                        <ul>
                            {PRODUCTS.filter((p) => p.soon).map((p) => (
                                <li key={p.page}>
                                    <a href={`${root}${p.href}`} aria-current={p.page === page ? 'page' : undefined} onClick={close}>
                                        <Mark brand={p.page} size={32} />
                                        <span className="mega-soon-text">
                                            <Wordmark brand={p.page} />
                                            <span className="mega-soon-job">{p.job}</span>
                                        </span>
                                        <Icon name="arrow" />
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Header({ onTheme }: { onTheme: () => void }) {
    const { root, theme } = useSite();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return;
        const close = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        window.addEventListener('keydown', close);
        return () => window.removeEventListener('keydown', close);
    }, [open]);

    return (
        <header className="site-header">
            <div className="container header-row">
                <a className="brand" href={root} aria-label="PingOmni home">
                    <Mark brand="pingomni" size={30} />
                    <Wordmark brand="pingomni" />
                </a>
                <nav className={open ? 'site-nav open' : 'site-nav'} aria-label="Main">
                    <ProductsMenu onNavigate={() => setOpen(false)} />
                    {NAV.map((item) => (
                        <a key={item.href} href={`${root}${item.href}`} onClick={() => setOpen(false)}>
                            {item.label}
                        </a>
                    ))}
                </nav>
                <div className="header-actions">
                    <button
                        type="button"
                        className="icon-btn"
                        onClick={onTheme}
                        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                        title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
                    >
                        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
                    </button>
                    <a className="btn btn-primary btn-sm header-cta" href={DEMO_URL} target="_blank" rel="noopener">
                        Try the demo
                    </a>
                    <button
                        type="button"
                        className="icon-btn menu-btn"
                        aria-expanded={open}
                        aria-label={open ? 'Close menu' : 'Open menu'}
                        onClick={() => setOpen(!open)}
                    >
                        <Icon name={open ? 'close' : 'menu'} />
                    </button>
                </div>
            </div>
        </header>
    );
}

export function Contact({ title, text }: { title: string; text: string }) {
    return (
        <section className="stage contact" id="contact" aria-labelledby="contact-title">
            <div className="container contact-row">
                <div>
                    <h2 id="contact-title" className="h2">
                        {title}
                    </h2>
                    <p className="lead">{text}</p>
                </div>
                <div className="contact-actions">
                    <a className="btn btn-primary btn-lg" href={DEMO_URL} target="_blank" rel="noopener">
                        Try the RadiusOne demo
                        <Icon name="external" />
                    </a>
                    <a className="contact-mail" href={mailto('Question for PingOmni')}>
                        <Icon name="mail" />
                        {CONTACT_EMAIL}
                    </a>
                </div>
            </div>
        </section>
    );
}

function Footer() {
    const { root } = useSite();
    return (
        <footer className="site-footer">
            <div className="container footer-row">
                <a className="brand" href={root} aria-label="PingOmni home">
                    <Mark brand="pingomni" size={24} />
                    <Wordmark brand="pingomni" />
                </a>
                <ul className="footer-products">
                    <li>
                        <a href={`${root}radiusone/`}>RadiusOne</a>
                    </li>
                    <li>
                        <a className="footer-soon" href={`${root}ticketone/`}>
                            TicketOne, coming soon
                        </a>
                    </li>
                    <li>
                        <a className="footer-soon" href={`${root}dnsone/`}>
                            DNSOne, coming soon
                        </a>
                    </li>
                    <li>
                        <a href={mailto('Question for PingOmni')}>{CONTACT_EMAIL}</a>
                    </li>
                </ul>
                <p className="small faint">© {new Date().getFullYear()} PingOmni</p>
            </div>
        </footer>
    );
}

export function Layout({ page, root, children }: { page: PageId; root: string; children: ReactNode }) {
    const [theme, setTheme] = useState<Theme>(currentTheme);
    const toggle = () => {
        const next: Theme = theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        try {
            localStorage.setItem('pingomni-theme', next);
        } catch {
            // Private mode: the choice lasts for this page only.
        }
        setTheme(next);
    };
    return (
        <SiteContext.Provider value={{ page, root, theme }}>
            <a className="skip-link" href="#main">
                Skip to content
            </a>
            <Header onTheme={toggle} />
            <main id="main">{children}</main>
            <Footer />
        </SiteContext.Provider>
    );
}

export function Shot({ name, alt, eager = false }: { name: string; alt: string; eager?: boolean }) {
    const { root, theme } = useSite();
    const size = name === 'clients' ? { width: 1200, height: 750 } : { width: 1800, height: 1500 };
    return (
        <img
            className="shot"
            src={`${root}shots/${name}-${theme}.jpg`}
            {...size}
            alt={alt}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
        />
    );
}
