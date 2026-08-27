import { element, shared, state } from '@markless/core';

// A widget whose rows are a keyed repeat: a row's handler is minted per
// component edge and carries no instance of its own, so the widget handle it
// reads has to come from the widget the dispatching row stands in.
export const rowsState = shared(
	() => {
		const box = state({ name: '', rows: ['a', 'b'] });
		const boxEl = element<HTMLDivElement>();

		return { ...box, boxEl };
	},
	{ scope: 'widget' },
);

export function RowsWidget({ name = '' }) @{
	const box = rowsState();
	box.name = name;

	<div data-rows-widget data-name={box.name} el={box.boxEl}>
		@for (const row of box.rows; key row) {
			<button
				type="button"
				data-rows-cell
				data-row={row}
				onClick={() => {
					const mine = box.boxEl;
					mine?.setAttribute('data-marked', `${box.name}:${row}`);
				}}
			>{row}</button>
		}
	</div>
}
