import { element, shared, state } from '@markless/core';
import { focusTarget } from './ehv-focus.ts';

// The same two structural patterns as ehv-shared/ehv-value, spelled differently
// throughout: other handle names, other element tags and attributes, the handle
// in the SECOND argument slot, the trigger written BEFORE the element it names,
// and a state write after the handle read rather than before it.
export const altWidget = shared(
	() => {
		const w = state({ label: '' });
		const surfaceRef = element<HTMLElement>();

		return { ...w, surfaceRef };
	},
	{ scope: 'widget' },
);

export function AltRoot({ children }) @{
	const w = altWidget();

	<article data-ehv-alt-root data-label={w.label}>{children}</article>
}

export function AltPoke() @{
	const w = altWidget();

	<span data-ehv-alt-poke onClick={() => {
		focusTarget('member', w.surfaceRef);
		w.label = 'poked';
	}}>poke</span>
}

export function AltSurface() @{
	const w = altWidget();

	<section tabindex="-1" data-ehv-alt-surface el={w.surfaceRef}>surface</section>
}
