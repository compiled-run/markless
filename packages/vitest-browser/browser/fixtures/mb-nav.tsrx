import { element, shared, state } from '@markless/core';
import { reportTagNames } from './mb-report.ts';

// Heterogeneous set typing: `element<HTMLElement[]>()` is ONE ordered collection
// spanning a <nav>, a <button> and an <a>. Declaring it once and binding it on
// every tag is the whole point - the narrow per-tag slot could not hold it.
export const mbNav = shared(
	() => {
		const s = state({ tags: '' });
		const partEls = element<HTMLElement[]>();

		return { ...s, partEls };
	},
	{ scope: 'widget' },
);

export function MbNavRoot({ children }) @{
	const nav = mbNav();

	<nav data-mb-nav data-tags={nav.tags} el={nav.partEls}>{children}</nav>
}

export function MbNavTrigger() @{
	const nav = mbNav();

	<button type="button" data-mb-nav-trigger el={nav.partEls}>open</button>
}

export function MbNavLink() @{
	const nav = mbNav();

	<a href="#mb" data-mb-nav-link el={nav.partEls}>link</a>
}

export function MbNavProbe() @{
	const nav = mbNav();

	<button type="button" data-mb-nav-probe onClick={() => {
		nav.tags = reportTagNames(nav.partEls);
	}}>probe</button>
}
