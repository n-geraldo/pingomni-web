// Header, footer and contact band shared by every page, plus the theme switch.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Mark, Wordmark } from '../brand';
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

const NAV: { page: PageId | 'use-cases' | 'about'; href: string; label: string }[] = [
    { page: 'radiusone', href: 'radiusone/', label: 'RadiusOne' },
    { page: 'ticketone', href: 'ticketone/', label: 'TicketOne' },
    { page: 'dnsone', href: 'dnsone/', label: 'DNSOne' },
    { page: 'use-cases', href: '#use-cases', label: 'Use cases' },
    { page: 'about', href: '#about', label: 'About' },
];

function Header({ onTheme }: { onTheme: () => void }) {
    const { page, root, theme } = useSite();
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
                    {NAV.map((item) => (
                        <a
                            key={item.href}
                            href={`${root}${item.href}`}
                            aria-current={item.page === page ? 'page' : undefined}
                            onClick={() => setOpen(false)}
                        >
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
                        <a className="soon" href={`${root}ticketone/`}>
                            TicketOne, coming soon
                        </a>
                    </li>
                    <li>
                        <a className="soon" href={`${root}dnsone/`}>
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
