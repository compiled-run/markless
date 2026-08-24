import { computed, state } from '@markless/core';

// Defect 100's minimal shape, with no behavior anywhere: a parent binds a live
// state cell into a child's prop, and the child derives a computed() from that
// prop. That is textbook authoring, and it must render on CSR and refresh when
// the parent writes.
function PropComputedChild({ label }) @{
	const shout = computed(() => `${label}!`);

	<span data-child-derived>{shout}</span>
}

export default function PropComputedChildPage() @{
	const page = state({ label: 'row' });

	<main data-prop-computed-child>
		<PropComputedChild label={page.label} />
		<button
			type="button"
			data-relabel
			onClick={() => {
				page.label = 'moved';
			}}
		>relabel</button>
	</main>
}
