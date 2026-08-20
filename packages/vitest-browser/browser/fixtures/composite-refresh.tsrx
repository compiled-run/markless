import { computed, shared, state } from '@markless/core';

// A widget family whose every rendered fact is a recombined expression over the
// shared instance: an attribute comparison, a nested attribute ternary, a text
// ternary, a factory computed() and a component-body computed(). All of them
// have to follow a write, not just the plain path read next to them.
export const gate = shared(() => {
	const g = state({ phase: 'shut' as 'shut' | 'ajar' | 'wide', pinned: false });
	const banner = computed(() => (g.phase === 'wide' ? 'WIDE' : 'NOT WIDE'));

	return {
		...g,
		banner,
		advance() {
			g.phase = g.phase === 'wide' ? 'shut' : 'wide';
		},
	};
}, { scope: 'widget' });

export function Frame({ pinned, children }) @{
	const g = gate();
	g.pinned = pinned;

	<section data-frame ui-wide={g.phase === 'wide'} ui-pinned={g.pinned === true}>
		{children}
	</section>
}

export function Handle() @{
	const g = gate();
	const shout = computed(() => (g.phase === 'wide' ? 'yes' : 'no'));

	<button
		type="button"
		data-handle
		data-phase={g.phase}
		aria-expanded={g.phase === 'ajar' ? 'mixed' : g.phase === 'wide' ? 'true' : 'false'}
		data-banner={g.banner}
		data-shout={shout}
		ui-wide={g.phase === 'wide'}
		onClick={() => g.advance()}
	>{g.phase === 'wide' ? 'wide' : 'shut'}</button>
}
