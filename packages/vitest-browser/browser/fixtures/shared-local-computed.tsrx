import { computed, shared, state } from '@markless/core';

// A component-local computed() that reads a shared instance. The emitted residue
// reader closes over the factory's own local, which does not exist at render.
export const cell = shared(
	() => {
		const c = state({ checked: false });
		return { ...c };
	},
	{ scope: 'widget' },
);

export function App() @{
	const c = cell();
	const label = computed(() => (c.checked === true ? 'true' : 'false'));

	<output data-local-computed>{label}</output>
}
