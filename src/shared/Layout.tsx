// Header, footer and contact band shared by every page, plus the theme switch.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Mark, Wordmark, type Brand } from '../brand';
import { ACCOUNT_URL, CONTACT_EMAIL, DEMO_URL, mailto } from '../config';
import Icon from '../Icon';
import { TOOL_LIST, TOOL_PAGES, type ToolGroup } from '../lib/toolList';

export type Theme = 'light' | 'dark';

// Bump when the screenshots are retaken: browsers and Cloudflare keep /shots/ for a day under the same address.
export const SHOTS_VERSION = '?v=3';
export type PageId = 'home' | 'radiusone' | 'ticketone' | 'dnsone' | 'docs' | 'docs-radiusone' | 'docs-dnsone' | 'guide-mikrotik-pppoe' | 'guide-rpz-powerdns' | 'tools-network' | 'tools-email' | 'tools-bgp' | 'notfound';

// Pages live at the root (home) or one folder down (products); links and images are relative to the site root.
type Site = { page: PageId; root: string; theme: Theme };
const SiteContext = createContext<Site>({ page: 'home', root: './', theme: 'light' });
export const useSite = () => useContext(SiteContext);

function currentTheme(): Theme {
    const set = document.documentElement.dataset.theme;
    if (set === 'light' || set === 'dark') return set;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// The Products menu: RadiusOne featured, then the other products available, then what is coming.
const PRODUCTS: { brand: Brand; page?: PageId; href: string; job: string; soon?: boolean }[] = [
    { brand: 'radiusone', page: 'radiusone', href: 'radiusone/', job: 'ISP back office on FreeRADIUS' },
    { brand: 'monitor', href: '#monitor', job: 'Uptime, SSL and domain monitoring for any website' },
    { brand: 'dnsone', page: 'dnsone', href: 'dnsone/', job: 'DNS for ISPs: zones, resolver and ad-blocking' },
    { brand: 'ticketone', page: 'ticketone', href: 'ticketone/', job: 'Support tickets for ISP help desks', soon: true },
];

// Shared open/close behaviour for the navbar menus: Escape or a click outside closes them.
function useMenu() {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
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
    return { open, setOpen, ref };
}

// The Tools menu: the tools pages side by side, each with its tools as direct links.
function ToolsMenu({ onNavigate }: { onNavigate: () => void }) {
    const { page, root } = useSite();
    const { open, setOpen, ref } = useMenu();
    const close = () => {
        setOpen(false);
        onNavigate();
    };
    const groups = Object.keys(TOOL_PAGES) as ToolGroup[];
    return (
        <div className={open ? 'nav-menu open' : 'nav-menu'} ref={ref}>
            <button
                type="button"
                className="nav-menu-btn"
                aria-expanded={open}
                aria-controls="tools-menu"
                data-current={page.startsWith('tools') || undefined}
                onClick={() => setOpen(!open)}
            >
                Tools
                <Icon name="chevron" />
            </button>
            <div className="mega" id="tools-menu">
                <div className="container mega-tools">
                    {groups.map((g) => {
                        const info = TOOL_PAGES[g];
                        const href = `${root}${info.path}`;
                        return (
                            <div className="mega-toolgroup" key={g}>
                                <a className="mega-toolgroup-head" href={href} aria-current={page === `tools-${g}` ? 'page' : undefined} onClick={close}>
                                    <span className="mega-toolgroup-icon">
                                        <Icon name={info.icon} />
                                    </span>
                                    <span>
                                        <strong>{info.title}</strong>
                                        <span>{info.blurb}</span>
                                    </span>
                                    <Icon name="arrow" />
                                </a>
                                <ul>
                                    {TOOL_LIST.filter((t) => t.group === g).map((t) => (
                                        <li key={t.id}>
                                            <a href={`${href}#${t.id}`} onClick={close}>
                                                <Icon name={t.icon} />
                                                {t.name}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

const NAV: { href: string; label: string; page?: PageId }[] = [
    { href: 'docs/', label: 'Docs', page: 'docs' },
    { href: '#about', label: 'About' },
];

function ProductsMenu({ onNavigate }: { onNavigate: () => void }) {
    const { page, root, theme } = useSite();
    const { open, setOpen, ref } = useMenu();
    const close = () => {
        setOpen(false);
        onNavigate();
    };
    const current = PRODUCTS.some((p) => p.page === page);

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
                        </div>
                        <p className="mega-feature-job">The ISP back office on FreeRADIUS: subscribers, plans, billing and NAS monitoring.</p>
                        <div className="mega-feature-body">
                            <a className="mega-shot" href={`${root}radiusone/`} tabIndex={-1} aria-hidden="true" onClick={close}>
                                <img src={`${root}shots/dashboard-${theme}-600.webp${SHOTS_VERSION}`} alt="The RadiusOne dashboard" width={600} height={500} loading="lazy" />
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
                        {([
                            ['Also available', PRODUCTS.filter((p) => p.brand !== 'radiusone' && !p.soon)],
                            ['Coming soon', PRODUCTS.filter((p) => p.soon)],
                        ] as const).map(([title, list]) => (
                            <div className="mega-soon-group" key={title}>
                                <p className="mega-soon-title">{title}</p>
                                <ul>
                                    {list.map((p) => (
                                        <li key={p.brand}>
                                            <a href={`${root}${p.href}`} aria-current={p.page && p.page === page ? 'page' : undefined} onClick={close}>
                                                <Mark brand={p.brand} size={32} />
                                                <span className="mega-soon-text">
                                                    <Wordmark brand={p.brand} />
                                                    <span className="mega-soon-job">{p.job}</span>
                                                </span>
                                                <Icon name="arrow" />
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Header({ onTheme }: { onTheme: () => void }) {
    const { page, root, theme } = useSite();
    const [open, setOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
        if (!open) return;
        const close = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        window.addEventListener('keydown', close);
        return () => window.removeEventListener('keydown', close);
    }, [open]);

    return (
        <header className={scrolled ? 'site-header scrolled' : 'site-header'}>
            <div className="container header-row">
                <a className="brand" href={root} aria-label="PingOmni home">
                    <Mark brand="pingomni" size={30} />
                    <Wordmark brand="pingomni" />
                </a>
                <nav className={open ? 'site-nav open' : 'site-nav'} aria-label="Main">
                    <ProductsMenu onNavigate={() => setOpen(false)} />
                    <ToolsMenu onNavigate={() => setOpen(false)} />
                    {NAV.map((item) => (
                        <a
                            key={item.href}
                            href={`${root}${item.href}`}
                            aria-current={item.page && (page.startsWith(item.page) || (item.page === 'docs' && page.startsWith('guide-'))) ? 'page' : undefined}
                            onClick={() => setOpen(false)}
                        >
                            {item.label}
                        </a>
                    ))}
                </nav>
                <div className="header-actions">
                    <a className="btn btn-sm btn-ghost header-signin" href={`${ACCOUNT_URL}/login`}>
                        Sign in
                    </a>
                    <button
                        type="button"
                        className="icon-btn"
                        onClick={onTheme}
                        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                        title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
                    >
                        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
                    </button>
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

// The demo button shows only on a product page; it opens that product's demo.
export function Contact({ title, text, demo = false, demoUrl = DEMO_URL, demoLabel = 'Try the RadiusOne demo' }: { title: string; text: string; demo?: boolean; demoUrl?: string; demoLabel?: string }) {
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
                    {demo && (
                        <a className="btn btn-primary btn-lg" href={demoUrl} target="_blank" rel="noopener">
                            {demoLabel}
                            <Icon name="external" />
                        </a>
                    )}
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
            <div className="container">
                <div className="footer-grid">
                    <div className="footer-about">
                        <a className="brand" href={root} aria-label="PingOmni home">
                            <Mark brand="pingomni" size={28} />
                            <Wordmark brand="pingomni" />
                        </a>
                        <p>Self-hosted software for ISPs and network operators, and PingOmni Monitor for every website.</p>
                    </div>
                    <nav className="footer-col" aria-labelledby="footer-products">
                        <p className="footer-title" id="footer-products">Products</p>
                        <a href={`${root}radiusone/`}>RadiusOne</a>
                        <a href={`${root}radiusone/#use-cases`}>RadiusOne use cases</a>
                        <a href={`${root}#monitor`}>PingOmni Monitor</a>
                        <a href={`${root}dnsone/`}>DNSOne</a>
                        <a href={`${root}docs/`}>Documentation</a>
                        <a href={`${root}guides/mikrotik-pppoe-freeradius/`}>MikroTik PPPoE with RadiusOne</a>
                        <a href={`${root}guides/rpz-ad-blocking-powerdns/`}>Ad-blocking with DNSOne</a>
                        <a className="footer-soon" href={`${root}ticketone/`}>
                            TicketOne <span>Soon</span>
                        </a>
                    </nav>
                    <nav className="footer-col" aria-labelledby="footer-company">
                        <p className="footer-title" id="footer-company">Company</p>
                        <a href={`${root}tools/network/`}>Network tools</a>
                        <a href={`${root}tools/email/`}>DNS & Email tools</a>
                        <a href={`${root}tools/bgp/`}>BGP & ASN tools</a>
                        <a href={ACCOUNT_URL}>PingOmni Account</a>
                        <a href={`${root}#about`}>About</a>
                        <a href="#contact">Contact</a>
                    </nav>
                    <div className="footer-col">
                        <p className="footer-title">Get in touch</p>
                        <a href={mailto('Question for PingOmni')}>{CONTACT_EMAIL}</a>
                    </div>
                </div>
                <p className="footer-bottom small faint">© {new Date().getFullYear()} PingOmni</p>
            </div>
        </footer>
    );
}

// Sections below the first screen rise in once as they scroll into view. Nothing is hidden before this runs.
function useReveal() {
    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
        const targets = [...document.querySelectorAll<HTMLElement>('main > section')].filter(
            (el) => el.getBoundingClientRect().top > window.innerHeight,
        );
        const io = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    if (!e.isIntersecting) continue;
                    e.target.classList.add('revealed');
                    io.unobserve(e.target);
                }
            },
            { rootMargin: '0px 0px -10% 0px' },
        );
        for (const el of targets) {
            el.classList.add('reveal');
            io.observe(el);
        }
        return () => io.disconnect();
    }, []);
}

export function Layout({ page, root, children }: { page: PageId; root: string; children: ReactNode }) {
    // Pages are pre-rendered in light; the visitor's theme is applied once the page is running.
    const [theme, setTheme] = useState<Theme>('light');
    useEffect(() => setTheme(currentTheme()), []);
    useReveal();
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

// Pixel sizes of the files in public/shots/ (the dashboards are 1800 x 1500).
const SHOT_SIZES: Record<string, { width: number; height: number }> = {
    clients: { width: 1200, height: 750 },
    'dnsone-queries': { width: 1200, height: 750 },
    'dnsone-protection': { width: 1920, height: 1200 },
    'dnsone-firewall': { width: 1920, height: 1200 },
    'dnsone-transfers': { width: 1920, height: 1200 },
};

// The smaller copies beside each screenshot (scripts/shot-variants.mjs), for files wider than them.
const SHOT_WIDTHS = [600, 1200];

/**
 * A screenshot as WebP (with JPEG for older browsers), in the smallest copy that is sharp at the size shown.
 * sizes: how wide the shot is drawn; the default fits a product hero (seven twelfths of the page).
 */
export function Shot({ name, alt, eager = false, sizes = '(max-width: 980px) 100vw, 680px' }: { name: string; alt: string; eager?: boolean; sizes?: string }) {
    const { root, theme } = useSite();
    const size = SHOT_SIZES[name] ?? { width: 1800, height: 1500 };
    const base = `${root}shots/${name}-${theme}`;
    const set = (ext: string) =>
        [...SHOT_WIDTHS.filter((w) => w < size.width).map((w) => `${base}-${w}.${ext}${SHOTS_VERSION} ${w}w`), `${base}.${ext}${SHOTS_VERSION} ${size.width}w`].join(', ');
    return (
        <picture>
            <source type="image/webp" srcSet={set('webp')} sizes={sizes} />
            <img
                className="shot"
                src={`${base}.jpg${SHOTS_VERSION}`}
                srcSet={set('jpg')}
                sizes={sizes}
                {...size}
                alt={alt}
                loading={eager ? 'eager' : 'lazy'}
                fetchPriority={eager ? 'high' : undefined}
                decoding="async"
            />
        </picture>
    );
}
