import { FRAGMENT_GUESS_BUDGET_BYTES, FRAGMENT_PREFETCH_CONNECTIONS } from './fragment-navigation.ts';

export { PREFETCH_LINK_CHOICES, type PrefetchLinkChoice } from '../link-attributes.ts';
export { PREFETCH_MARKS } from './fragment-navigation.ts';

/** The triggers `router({ prefetch })` takes; a tool that writes router config can detect support by this export. */
export const PREFETCH_TRIGGERS = ['intent', 'viewport', 'idle'] as const;
export type PrefetchTrigger = (typeof PREFETCH_TRIGGERS)[number];

/** Each trigger's values, in order of how many networks they allow. */
export const PREFETCH_NETWORKS = ['none', 'fast', 'all'] as const;

/**
 * Which networks a prefetch trigger runs on. `'fast'` means the page's own downloads crossed the link at
 * Slow 4G speed or better (or, with too few bytes to tell, the browser reports a fast connection).
 * Under Save-Data, or while the tab is hidden, no trigger runs, whatever it is set to.
 */
export type PrefetchNetworks = (typeof PREFETCH_NETWORKS)[number];

/** When the router fetches a linked page before its click. Plain data, so a generated config can set it. */
export type RouterPrefetchOptions = {
	/**
	 * `intent`: a mouse resting on a link, keyboard focus, a press or a touch. Default `'all'`.
	 * `viewport`: every page link while it is in view, nearest the pointer (else the viewport's centre) first. Default `'none'`.
	 * `idle`: once the page is idle, up to six page links in view. Default `'fast'`.
	 */
	readonly [Trigger in PrefetchTrigger]?: PrefetchNetworks;
} & {
	/** How many viewport and idle fetches may be in flight at once. Default 2. */
	readonly concurrency?: number;
	/**
	 * Bytes on the wire viewport and idle fetches may spend per page shown; once spent they stop until the next
	 * page, and intent still fetches. Default 2 MiB.
	 */
	readonly budget?: number;
};

/** `false` (or `'none'`) fetches nothing before a click; links still navigate. */
export type RouterPrefetch = boolean | 'none' | RouterPrefetchOptions;

// [intent, viewport, idle] as 0 none, 1 fast, 2 all: the browser reads a level with one comparison.
export type PrefetchLevels = readonly [intent: number, viewport: number, idle: number];

export interface PrefetchPolicy {
	readonly levels: PrefetchLevels;
	readonly concurrency: number;
	readonly budget: number;
}

export const PREFETCH_DEFAULTS = {
	intent: 'all',
	viewport: 'none',
	idle: 'fast',
	concurrency: FRAGMENT_PREFETCH_CONNECTIONS,
	budget: FRAGMENT_GUESS_BUDGET_BYTES,
} as const satisfies Required<RouterPrefetchOptions>;

export function prefetchPolicy(prefetch: RouterPrefetch | undefined): PrefetchPolicy {
	if (prefetch === false || prefetch === 'none')
		return { levels: [0, 0, 0], concurrency: PREFETCH_DEFAULTS.concurrency, budget: 0 };
	if (
		prefetch !== undefined &&
		prefetch !== true &&
		(typeof prefetch !== 'object' || prefetch === null || Array.isArray(prefetch))
	)
		throw new Error(
			`Markless router: prefetch is ${JSON.stringify(prefetch)}; use true, false, 'none' or an object of ${PREFETCH_TRIGGERS.join(', ')}, concurrency and budget.`,
		);
	const options = typeof prefetch === 'object' ? prefetch : {};
	const level = (trigger: PrefetchTrigger) => {
		const value = options[trigger] ?? PREFETCH_DEFAULTS[trigger];
		const at = PREFETCH_NETWORKS.indexOf(value);
		if (at === -1)
			throw new Error(
				`Markless router: prefetch.${trigger} is ${JSON.stringify(value)}; use ${PREFETCH_NETWORKS.map((name) => `'${name}'`).join(', ')}.`,
			);
		return at;
	};
	for (const key of Object.keys(options))
		if (
			key !== 'concurrency' &&
			key !== 'budget' &&
			!(PREFETCH_TRIGGERS as readonly string[]).includes(key)
		)
			throw new Error(
				`Markless router: prefetch.${key} is not a trigger; use ${PREFETCH_TRIGGERS.join(', ')}, concurrency or budget.`,
			);
	const concurrency = options.concurrency ?? PREFETCH_DEFAULTS.concurrency;
	if (!Number.isInteger(concurrency) || concurrency < 1)
		throw new Error(
			`Markless router: prefetch.concurrency is ${JSON.stringify(concurrency)}; use a whole number of at least 1.`,
		);
	const budget = options.budget ?? PREFETCH_DEFAULTS.budget;
	if (!Number.isInteger(budget) || budget < 0)
		throw new Error(
			`Markless router: prefetch.budget is ${JSON.stringify(budget)}; use a whole number of bytes, 0 or more.`,
		);
	const [intent, viewport, idle] = PREFETCH_TRIGGERS.map(level) as [number, number, number];
	return { levels: [intent, viewport, idle], concurrency, budget };
}

export function prefetches(policy: PrefetchPolicy): boolean {
	return policy.levels.some((level) => level > 0);
}
