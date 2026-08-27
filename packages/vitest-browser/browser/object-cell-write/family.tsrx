import { computed, shared, state } from '@markless/core';

// The crop shape: a cell whose seed is a plain object, spread onto a `shared()`
// instance, written whole from a shared method and from a part's handler.
export const boxState = shared(
	() => {
		const box = state({
			own: { x: 1, y: 2 },
			list: [10, 20],
		});

		return {
			...box,
			place() {
				box.own = { x: 5, y: 7 };
			},
			grow() {
				box.list = [10, 20, 30];
			},
		};
	},
	{ scope: 'widget' },
);

export function BoxRoot({ children }) @{
	const box = boxState();

	<div data-ocwf-root>{children}</div>
}

export function BoxReadout() @{
	const box = boxState();
	const shifted = computed(() => box.own.x + 100);
	const rows = computed(() => box.list.length);

	<div data-ocwf-readout ui-own-x={box.own.x} aria-valuenow={box.own.y} style={{ insetInlineStart: `${box.own.x}px` }}>
		<output data-ocwf-x>{box.own.x}</output>
		<output data-ocwf-y>{box.own.y}</output>
		<output data-ocwf-shifted>{shifted}</output>
		<output data-ocwf-rows>{rows}</output>
		<input type="hidden" data-ocwf-field-value value={shifted} />
	</div>
}

export function BoxControls() @{
	const box = boxState();

	<div data-ocwf-controls>
		<button type="button" data-ocwf-method onClick={() => box.place()}>method</button>
		<button
			type="button"
			data-ocwf-handler
			onClick={() => {
				box.own = { x: 8, y: 9 };
			}}
		>handler</button>
		<button
			type="button"
			data-ocwf-field
			onClick={() => {
				box.own.x = 3;
			}}
		>field</button>
		<button type="button" data-ocwf-array onClick={() => box.grow()}>array</button>
	</div>
}
