import { shared, state, computed } from '@markless/core';

// Page-scoped sibling of the widget family: the factory returns one computed
// written INLINE in the returned object literal, keyed by its property name.
export const tally = shared(() => {
	const box = state({ marked: false });

	return {
		...box,
		mark: computed(() => (box.marked === true ? 'yes' : 'no')),
		flip() {
			box.marked = !box.marked;
		},
	};
});

function TallyReadout() @{
	const t = tally();

	<output data-tally-mark>{t.mark}</output>
}

export default function TallyPage() @{
	const t = tally();

	<main data-tally-page>
		<TallyReadout />
		<button type="button" data-tally-flip onClick={() => t.flip()}>flip</button>
	</main>
}
