import { computed, shared, state } from '@markless/core';

// The aloof shape with one difference: the outermost part the page renders is
// also the first component in this module to resolve the definition.
export const firstBox = shared(
	() => {
		const box = state({
			items: [] as readonly string[],
			seen: '',
		});

		return { ...box };
	},
	{ scope: 'widget' },
);

export function FirstField() @{
	const box = firstBox();
	const size = computed(() => box.items.length);

	<div data-testid="field" ui-count={size} ui-seen={box.seen}>
		@for (const item of box.items; key item) {
			<input type="hidden" name="topics" value={item} />
		}
		<FirstAdder />
	</div>
}

export function FirstAdder() @{
	const box = firstBox();

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

export function FirstAloofRoot({ children }) @{
	<div data-testid="root">{children}</div>
}
