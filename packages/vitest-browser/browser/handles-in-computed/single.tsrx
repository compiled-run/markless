import { computed, element, shared, state } from '@markless/core';
import { hasElementGlobal, tagOf } from './report.ts';

// The singular case: the part binds the handle on its OWN host element, so the
// element the read wants is the one the read renders into. `where` records the
// environment the derivation itself ran in.
export const single = shared(
	() => {
		const s = state({ tick: 0, probed: '' });
		const boxEl = element<HTMLDivElement>();

		return { ...s, boxEl };
	},
	{ scope: 'widget' },
);

export function SingleRoot({ children }) @{
	const s = single();
	const derived = computed(() => `${s.tick}|${tagOf(s.boxEl)}`);
	const where = computed(() => `${s.tick}|${hasElementGlobal()}`);

	<div
		data-hic-single-root
		data-derived={derived}
		data-where={where}
		data-probed={s.probed}
		el={s.boxEl}
	>
		{children}
		<button type="button" data-hic-bump onClick={() => (s.tick = s.tick + 1)}>bump</button>
		<button
			type="button"
			data-hic-probe
			onClick={() => {
				const box = s.boxEl;
				s.probed = `${s.tick}|${tagOf(box)}|${hasElementGlobal()}`;
			}}
		>probe</button>
	</div>
}
