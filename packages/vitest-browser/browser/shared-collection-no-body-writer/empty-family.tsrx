import { computed, shared, state } from '@markless/core';

// EmptyRoot is declared first, so the compiler gives it this definition's cells
// and a page that never renders it roots the widget nowhere.
export const emptyBox = shared(
	() => {
		const box = state({
			items: [] as readonly string[],
			seen: '',
		});

		return { ...box };
	},
	{ scope: 'widget' },
);

export function EmptyRoot({ children }) @{
	const box = emptyBox();

	<div data-testid="root" ui-empty={box.items.length === 0}>{children}</div>
}

/** A root that never resolves the definition, so it carries none of its cells. */
export function AloofRoot({ children }) @{
	<div data-testid="root">{children}</div>
}

export function EmptyAdder() @{
	const box = emptyBox();

	<div data-testid="adder">
		<button
			type="button"
			data-testid="add"
			onClick={() => {
				box.items = [...box.items, 'gamma'];
				box.seen = 'gamma added';
			}}
		>add</button>
	</div>
}

export function EmptyField() @{
	const box = emptyBox();
	const size = computed(() => box.items.length);

	<div data-testid="field" ui-count={size} ui-seen={box.seen}>
		@for (const item of box.items; key item) {
			<input type="hidden" name="topics" value={item} />
		}
		<span data-testid="len">{box.items.length}</span>
	</div>
}

/** The same field, with the writer nested inside it rather than beside it. */
export function EmptyFieldHoldingAdder() @{
	const box = emptyBox();
	const size = computed(() => box.items.length);

	<div data-testid="field" ui-count={size} ui-seen={box.seen}>
		@for (const item of box.items; key item) {
			<input type="hidden" name="topics" value={item} />
		}
		<EmptyAdder />
	</div>
}
