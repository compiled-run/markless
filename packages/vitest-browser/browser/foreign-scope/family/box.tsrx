import { computed, shared, state } from '@markless/core';
import { shout } from './helpers.ts';

// The scope the factory's computeds are written in: an import that resolves
// against THIS directory, and a module constant. A page in another directory
// re-derives these cells from a copy of their expressions, so both have to
// travel with the copy.
const SUFFIX = '!';

export const box = shared(
	() => {
		const s = state({ label: 'quiet' });
		const loud = computed(() => shout(s.label) + SUFFIX);
		const framed = computed(() => SUFFIX + shout(s.label) + SUFFIX);
		return { ...s, loud, framed };
	},
	{ scope: 'widget' },
);

export function Box() @{
	const b = box();

	<div data-box-own>{b.loud}</div>
}
