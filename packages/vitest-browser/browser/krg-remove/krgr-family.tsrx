import { shared, state } from '@markless/core';
import { type KrgrRow, withRow, withoutRow } from './krgr-rows.ts';

/**
 * A widget-scoped collection, grown and shrunk by the widget's own methods.
 *
 * This is the shape the fileupload family ships: the rows start empty, a part's
 * handler grows the list, and another part's handler takes one key back out.
 */
export const krgrStore = shared(
	() => {
		const store = state({
			name: '',
			rows: [
				{ id: 'a', label: 'alpha' },
				{ id: 'b', label: 'bravo' },
				{ id: 'c', label: 'charlie' },
			] as readonly KrgrRow[],
		});

		return {
			...store,

			grow(id: string) {
				store.rows = withRow(store.rows, id);
			},

			drop(id: string) {
				store.rows = withoutRow(store.rows, id);
			},
		};
	},
	{ scope: 'widget' },
);

export const krgrItem = shared(
	() => {
		const item = state({ id: '', value: '' });

		return { ...item };
	},
	{ scope: 'widget' },
);

export function KrgrRoot({ name = '', children, ...rest }) @{
	const store = krgrStore();
	store.name = name;

	<div {...rest} data-krgr-root data-krgr-name={store.name}>{children}</div>
}

export function KrgrLength({ ...rest }) @{
	const store = krgrStore();

	<output {...rest} data-krgr-length>{store.rows.length}</output>
}

export function KrgrAdd({ id, children, ...rest }) @{
	const store = krgrStore();

	<button {...rest} type="button" onClick={() => store.grow(id)}>{children}</button>
}

export function KrgrItem({ row, children, ...rest }) @{
	const item = krgrItem();
	item.id = row.id;
	item.value = row.label;

	<div {...rest} data-krgr-widget-row data-krgr-id={item.id} data-krgr-value={item.value}>{children}</div>
}

export function KrgrItemDrop({ children, ...rest }) @{
	const store = krgrStore();
	const item = krgrItem();

	<button {...rest} data-krgr-owner={store.name} type="button" onClick={() => store.drop(item.id)}>{children}</button>
}

export function KrgrRowDrop({ id, children, ...rest }) @{
	const store = krgrStore();

	<button {...rest} type="button" onClick={() => store.drop(id)}>{children}</button>
}
