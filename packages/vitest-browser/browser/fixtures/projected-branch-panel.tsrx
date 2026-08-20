import { shared, state } from '@markless/core';

// Deliberately unlike the checkbox/gate shapes the defect was found in: a
// switch-free `@if` whose arm mixes a static element with the projected
// children, a second part that branches on the SAME field without projecting,
// and different element/attribute/state names throughout.
export const panel = shared(
	() => {
		const p = state({ expanded: false });
		return {
			...p,
			flip() {
				p.expanded = p.expanded !== true;
			},
		};
	},
	{ scope: 'widget' },
);

export function Panel({ children }) @{
	const p = panel();
	<article data-panel data-expanded={p.expanded}>{children}</article>
}

export function Handle() @{
	const p = panel();
	<button type="button" data-panel-handle onClick={() => p.flip()}>flip</button>
}

// Projected: the arm shows what the page put inside <Body>.
export function Body({ children }) @{
	const p = panel();
	<section data-panel-body>@if (p.expanded) { <><b data-panel-mark>+</b>{children}</> }</section>
}

// Control: same field, same flip, but the arm owns its own markup.
export function Note() @{
	const p = panel();
	<aside data-panel-note>@if (p.expanded) { <i>shown</i> }</aside>
}
