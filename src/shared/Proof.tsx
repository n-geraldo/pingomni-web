import Icon from '../Icon';

// The two ways a page states its facts: a short row of ticks under the hero's buttons, and a dark band of numbers
// (site.css, "Enterprise pass"). Every fact here must be one of the product's own, never a claim about customers.

/** Three short facts under a hero's buttons, each with a tick. */
export function HeroFacts({ items }: { items: string[] }) {
    return (
        <ul className="hero-facts" aria-label="In short">
            {items.map((item) => (
                <li key={item}>
                    <Icon name="check" />
                    {item}
                </li>
            ))}
        </ul>
    );
}

/** A dark band with four numbers, each with a line saying what it counts. */
export function ProofBand({ label, facts }: { label: string; facts: [number: string, text: string][] }) {
    return (
        <section className="proof" aria-label={label}>
            <div className="container">
                <ul className="proof-grid">
                    {facts.map(([n, text]) => (
                        <li key={text}>
                            <strong>{n}</strong>
                            <span>{text}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
