import { computed, shared, state } from '@markless/core';

type BoxInstanceState = {
	items: readonly string[];
	seen: string;
	name: string;
};

// @markless/ui's taglist reduced to its skeleton: a widget-scope spread-object
// factory, a root that writes the collection from its own prop on every render,
// one part holding a keyed repeat over that collection, and a sibling part that
// writes it.
export const listBox = shared(
	() => {
		const box: BoxInstanceState = state({
			items: [] as readonly string[],
			seen: '',
			name: '',
		});

		return { ...box };
	},
	{ scope: 'widget' },
);

export function BoxSeededRoot({ value = [], name = '', children }) @{
	const box = listBox();
	box.items = value;
	box.name = name;

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

// The repeat, plus four other reads of the same cells: a computed, a plain cell,
// a property of the collection, and a method call on it in both positions.
export function BoxField() @{
	const box = listBox();
	const size = computed(() => box.items.length);

	<div data-testid="field" ui-count={size} ui-seen={box.seen}>
		@for (const item of box.items; key item) {
			<input type="hidden" name="topics" value={item} />
		}
		<span data-testid="joined" ui-joined={box.items.join('|')}>{box.items.join('|')}</span>
		<span data-testid="plain">{box.seen}</span>
		<span data-testid="len">{box.items.length}</span>
	</div>
}

/** taglist's own field: one row attribute reads an instance cell, not the item. */
export function BoxNamedField() @{
	const box = listBox();
	const size = computed(() => box.items.length);

	<div data-testid="named-field" ui-count={size}>
		@for (const item of box.items; key item) {
			<input type="hidden" name={box.name} value={item} />
		}
	</div>
}
