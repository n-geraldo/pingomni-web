import { useState } from 'react';
import { buyUrl } from '../config';
import Icon from '../Icon';

// PingOmni Monitor's plans, as PingOmni Account sells them (EUR, VAT added where it applies; a year is ten months' price).
// The limits are Monitor's own (config/monitor.php 'plans').
export const PLANS: { name: string; monthly: number; yearly: number; limits: string[]; note?: string }[] = [
    {
        name: 'Free',
        monthly: 0,
        yearly: 0,
        limits: ['10 monitors', 'Checks every 5 minutes', '1 status page', '1 person', '2 alert channels', '7 days of history'],
        note: 'Ready at once, no card',
    },
    {
        name: 'Starter',
        monthly: 6,
        yearly: 60,
        limits: ['25 monitors', 'Checks every minute', '2 status pages', '100 email subscribers a page', '3 people', '5 alert channels', '30 days of history'],
    },
    {
        name: 'Pro',
        monthly: 19,
        yearly: 190,
        limits: [
            '100 monitors',
            'Checks every 30 seconds',
            '10 status pages on your own domain',
            '1,000 email subscribers a page',
            '10 people',
            '20 alert channels',
            '90 days of history',
        ],
    },
    {
        name: 'Business',
        monthly: 45,
        yearly: 450,
        limits: [
            '500 monitors',
            'Checks every 30 seconds',
            '50 status pages on your own domain',
            '10,000 email subscribers a page',
            '50 people',
            '100 alert channels',
            '180 days of history',
        ],
    },
];

export function MonitorPlans({ id = 'plans' }: { id?: string }) {
    const [yearly, setYearly] = useState(true);
    const euro = (n: number) => `€${n.toLocaleString('en')}`;
    return (
        <section className="section section-bg" id={id} aria-labelledby={`${id}-title`}>
            <div className="container">
                <div className="section-head section-head-center">
                    <h2 id={`${id}-title`} className="h2">
                        Start free. Grow when you need to.
                    </h2>
                    <p className="lead">
                        Every plan has every check type, alerts, escalation and status pages. Paid plans add monitors, faster checks, people,
                        subscribers and history.
                    </p>
                    <div className="period" role="group" aria-label="Billing period">
                        <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)}>
                            Monthly
                        </button>
                        <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)}>
                            Yearly <span className="period-save">2 months free</span>
                        </button>
                    </div>
                </div>
                <div className="plans">
                    {PLANS.map((p) => {
                        const price = yearly ? p.yearly : p.monthly;
                        return (
                            <article className="plan" key={p.name} aria-labelledby={`plan-${p.name}`} data-featured={p.name === 'Pro' || undefined}>
                                <h3 id={`plan-${p.name}`} className="plan-name">
                                    {p.name}
                                </h3>
                                <p className="plan-price">
                                    <strong>{euro(price)}</strong>
                                    <span>{price === 0 ? 'forever' : yearly ? '/ year' : '/ month'}</span>
                                </p>
                                <p className="plan-sub small muted">{p.note ?? (yearly ? `${euro(p.monthly)} a month, paid monthly` : `or ${euro(p.yearly)} a year`)}</p>
                                <ul className="plan-limits">
                                    {p.limits.map((l) => (
                                        <li key={l}>
                                            <Icon name="check" />
                                            {l}
                                        </li>
                                    ))}
                                </ul>
                                <a className={p.name === 'Free' || p.name === 'Pro' ? 'btn btn-primary' : 'btn'} href={buyUrl('monitor')}>
                                    {p.name === 'Free' ? 'Start free' : `Choose ${p.name}`}
                                </a>
                            </article>
                        );
                    })}
                </div>
                <p className="plans-note small muted">
                    Prices in euros; VAT is added where it applies. Paid plans are paid by card in your PingOmni Account, through POK’s secure
                    payment page. The plan starts as soon as the payment goes through.
                </p>
            </div>
        </section>
    );
}
