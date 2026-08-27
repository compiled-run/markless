import { computed, shared, state } from '@markless/core';

/**
 * The smallest widget carrying the calendar title's shape: a part whose whole
 * body is an `@if/@else` inside an `aria-live` element, where the `@else` arm
 * renders a `computed()` off widget-scoped state, and a root that copies its
 * props into that same state on every pass.
 */
export const lrbStore = shared(
	() => {
		const store = state({ seed: '', monthSeed: '', monthAt: '', taps: 0, custom: false });
		const title = computed(() => {
			const at = store.monthAt !== '' ? store.monthAt : store.monthSeed;
			return `${at} 2026`;
		});

		return {
			...store,
			title,

			next() {
				store.monthAt = 'September';
			},

			tap() {
				store.taps = store.taps + 1;
			},

			flip() {
				store.custom = !store.custom;
			},
		};
	},
	{ scope: 'widget' },
);

export function LrbRoot({ month = '', picked = '', children, ...rest }) @{
	const store = lrbStore();
	store.monthSeed = month;
	store.seed = picked;

	<div {...rest} data-lrb-root>{children}</div>
}

// `children` is the branch test, exactly as the calendar title writes it: with
// no children the arm never moves, so nothing here may ever be rewritten.
export function LrbTitle({ children, ...rest }) @{
	const store = lrbStore();

	<h2 {...rest} aria-live="polite">
		@if (children) { <>{children}</> } @else { <>{store.title}</> }
	</h2>
}

export function LrbFlipTitle({ ...rest }) @{
	const store = lrbStore();

	<h3 {...rest} aria-live="polite">
		@if (store.custom) { <>Custom heading</> } @else { <>{store.title}</> }
	</h3>
}

export function LrbTaps({ ...rest }) @{
	const store = lrbStore();

	<p {...rest} aria-live="polite">Taps: {store.taps}</p>
}

export function LrbTap({ children, ...rest }) @{
	const store = lrbStore();

	<button {...rest} type="button" onClick={() => store.tap()}>{children}</button>
}

export function LrbNext({ children, ...rest }) @{
	const store = lrbStore();

	<button {...rest} type="button" onClick={() => store.next()}>{children}</button>
}

export function LrbFlip({ children, ...rest }) @{
	const store = lrbStore();

	<button {...rest} type="button" onClick={() => store.flip()}>{children}</button>
}
