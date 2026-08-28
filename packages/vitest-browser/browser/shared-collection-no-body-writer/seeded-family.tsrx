import { computed, shared, state } from '@markless/core';

// This family's root SEEDS it from its own props, so the compiler gives the
// cells to that one component and no other resolver carries them. A page that
// renders none of the root holds the family's cells at no id at all - which is
// the one page a bare widget id cannot mean "page-wide on purpose" on.
export const seededBox = shared(
	() => {
		const box = state({
			items: [] as readonly string[],
			seen: '',
		});

		return { ...box };
	},
	{ scope: 'widget' },
);

export function SeededRoot({ items = [] as readonly string[], children }) @{
	const box = seededBox();
	box.items = items;

	<div data-testid="root" ui-empty={box.items.length === 0}>{children}</div>
}

/** Reads the family only from a handler, so a page holding it alone still renders. */
export function SeededAdder() @{
	const box = seededBox();

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

export function SeededField() @{
	const box = seededBox();
	const size = computed(() => box.items.length);

	<div data-testid="field" ui-count={size} ui-seen={box.seen}>
		@for (const item of box.items; key item) {
			<input type="hidden" name="topics" value={item} />
		}
	</div>
}
