import { computed, shared, state } from '@markless/core';

type BoxInstanceState = {
	items: readonly string[];
	seen: string;
};

// @markless/ui's taglist reduced to its skeleton: a widget-scope spread-object
// factory, a root that writes the collection from its own prop on every render,
// one part holding a keyed repeat over that collection, and a sibling part that
// writes it.
export const listBox = shared(
	() => {
		const box: BoxInstanceState = state({ items: [] as readonly string[], seen: '' });

		return { ...box };
	},
	{ scope: 'widget' },
);

export function BoxSeededRoot({ value = [], children }) @{
	const box = listBox();
	box.items = value;

	<div data-testid="root" ui-empty={box.items.length === 0}>{children}</div>
}

/** The writer: a sibling part, as taglist's close button and field are. */
export function BoxAdder() @{
	const box = listBox();
	const label = computed(() => `${box.items.length} held`);

	<div data-testid="adder" ui-label={label}>
		<button
			type="button"
			data-testid="add"
			onClick={() => {
				box.items = [...box.items, 'gamma'];
				box.seen = 'gamma added';
			}}
		>add</button>
		<button
			type="button"
			data-testid="drop"
			onClick={() => {
				box.items = box.items.filter((item) => item !== 'alpha');
				box.seen = 'alpha removed';
			}}
		>drop</button>
	</div>
}

/** The repeat, plus attribute reads of the same cells on the same element. */
export function BoxField() @{
	const box = listBox();
	const size = computed(() => box.items.length);

	<div data-testid="field" ui-count={size} ui-seen={box.seen}>
		@for (const item of box.items; key item) {
			<input type="hidden" name="topics" value={item} />
		}
	</div>
}
