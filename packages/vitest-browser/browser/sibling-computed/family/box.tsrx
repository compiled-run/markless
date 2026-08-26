import { computed, shared, state } from '@markless/core';

// A factory that composes its own derived cells: `banged` reads `loud`, and both
// `asked` and `shouted` read `banged`. Each read is the sibling's NAME, because
// computed() answers with the derived value rather than a handle to call.
export const box = shared(
	() => {
		const s = state({ label: 'quiet' });
		const loud = computed(() => s.label.toUpperCase());
		const banged = computed(() => loud + '!');
		const asked = computed(() => banged + '?');
		const shouted = computed(() => banged + banged);
		return { ...s, loud, banged, asked, shouted };
	},
	{ scope: 'widget' },
);
