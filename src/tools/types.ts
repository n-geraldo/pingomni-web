import type { ReactNode } from 'react';
import type { Result } from '../lib/api';
import type { Next, Values } from './ui';

export type Option = { value: string; label: string };

export type Field = {
    name: string;
    label: string;
    placeholder?: string;
    /** A short line under the field: what to enter, or what an abbreviation means. */
    hint?: ReactNode;
    options?: Option[];
    width?: 'narrow' | 'medium';
    /** Shown under "More options" instead of in the main row. */
    advanced?: boolean;
    /** May be left empty. */
    optional?: boolean;
    /** Shown only when this returns true for the current values. */
    showIf?: (v: Values) => boolean;
    numeric?: boolean;
};

export type Progress = { text: string; pct?: number; value?: string };

export type ToolSpec = {
    id: string;
    /** The button: "Run ping", "Check DNS". */
    action: string;
    /** When to use this tool, in one line. */
    bestFor: string;
    fields: Field[];
    /** Where the test runs for these values, said before it starts. */
    runsOn: (v: Values) => string;
    /** How long a run usually takes, shown while it runs. */
    duration?: string;
    run?: (v: Values, progress: (p: Progress) => void) => Promise<Result>;
    render?: (r: Result, v: Values) => ReactNode;
    /** A tool with its own interface instead of the form (the subnet calculator). */
    custom?: (initial: Values) => ReactNode;
    /** Command output the result was read from, when there is any. */
    raw?: (r: Result) => string;
    next?: (r: Result, v: Values) => Next[];
    /** The value other tools receive as their target. */
    target?: (v: Values) => string;
    /** Shown before the first run. */
    idle?: ReactNode;
};
