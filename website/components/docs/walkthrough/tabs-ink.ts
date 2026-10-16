// The package-manager tabs drawn in the figures' fineliner, frozen to tabs-ink.art.ts by walkthrough.test.ts.
import { hatch, outline, type P, pathOf, resample, seeded } from '../../figures/ink/ink.ts';
import { MANAGERS } from './facts.ts';

export const TAB = { w: 78, h: 36, tuck: 8 } as const;

function silhouette(rnd: () => number): P[] {
	const { w, h } = TAB;
	const lean = 6 + rnd() * 2;
	const top = 2 + rnd() * 1.5;
	return resample([[2, h], [lean, top + 5], [lean + 4, top], [w - lean - 4, top + (rnd() - 0.5) * 1.2], [w - lean, top + 5], [w - 2, h]], 2);
}

/** One drawing per tab: paper that runs past the tab's foot to hide the strip's torn edge when picked, hatching when not, and the inked sides and top. */
export function tabsInk() {
	return MANAGERS.map((manager, i) => {
		const rnd = seeded(900 + i * 23);
		const edge = silhouette(rnd);
		const body: P[] = [...edge, [TAB.w - 2, TAB.h + TAB.tuck], [2, TAB.h + TAB.tuck]];
		return {
			id: manager.id,
			label: manager.label,
			paper: pathOf(body, true),
			back: pathOf([...edge, [TAB.w - 2, TAB.h], [2, TAB.h]], true),
			tone: hatch([...edge, [TAB.w - 2, TAB.h], [2, TAB.h]], -0.95, 2.6, 920 + i, { cluster: 4, skip: 0.2, trim: 0.25 }),
			ink: outline(edge, { w: 1.5, heavy: 0.9, seed: 940 + i }, false),
		};
	});
}
