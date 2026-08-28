import { shared, state } from '@markless/core';

/**
 * A widget the PANEL root owns, standing between the collection and the rows.
 *
 * The collection the `@for` walks is a page-level cell, so the collection node
 * names no instance at all while the repeat host stands inside this widget. A
 * minted row's part reads this instance, which is what a row-relative anchor can
 * find and a collection-relative one cannot.
 */
export const ropPanel = shared(
	() => {
		const panel = state({ label: '' });

		return { ...panel };
	},
	{ scope: 'widget' },
);

export function RopPanel({ label = '', children, ...rest }: { readonly label?: string; readonly children?: unknown }) @{
	const panel = ropPanel();
	panel.label = label;

	<div {...rest} data-rop-panel data-rop-panel-label={panel.label}>{children}</div>
}

export function RopRow({ label = '', ...rest }: { readonly label?: string }) @{
	const panel = ropPanel();
	const cell = state({ label });

	<li {...rest} data-rop-row data-rop-value={cell.label} data-rop-owner={panel.label}>{cell.label}</li>
}
