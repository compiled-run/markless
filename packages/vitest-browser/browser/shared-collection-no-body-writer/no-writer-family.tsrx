import { computed, shared, state } from '@markless/core';

type BoxInstanceState = {
	items: readonly string[];
	seen: string;
};

// The one ingredient this family isolates: the collection is seeded by the
// factory and NO component body ever assigns it. Only a sibling part's handler
// writes it.
export const noWriterBox = shared(
	() => {
		const box: BoxInstanceState = state({
			items: ['alpha', 'beta'] as readonly string[],
			seen: '',
		});

		return { ...box };
	},
	{ scope: 'widget' },
);

/** Reads the collection, never writes it. */
export function NoWriterRoot({ children }) @{
	const box = noWriterBox();

	<div data-testid="root" ui-empty={box.items.length === 0}>{children}</div>
}

/** The only writer on the page, and it writes from a handler. */
export function NoWriterAdder() @{
	const box = noWriterBox();

	<div data-testid="adder">
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
			data-testid="note"
			onClick={() => {
				box.seen = 'noted';
			}}
		>note</button>
	</div>
}

export function NoWriterField() @{
	const box = noWriterBox();
	const size = computed(() => box.items.length);

	<div data-testid="field" ui-count={size} ui-seen={box.seen}>
		@for (const item of box.items; key item) {
			<input type="hidden" name="topics" value={item} />
		}
		<span data-testid="len">{box.items.length}</span>
	</div>
}
