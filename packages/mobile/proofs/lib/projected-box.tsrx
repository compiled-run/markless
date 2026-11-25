import { element, shared, state } from '@markless/core';

export const boxState = shared(
	() => {
		const box = state({ wide: false, seen: '' });
		const labelEl = element<HTMLSpanElement | undefined>();
		return { ...box, labelEl };
	},
	{ scope: 'subtree' },
);

export function BoxRoot({ wide = false, children }: { wide?: boolean; children?: unknown }) @{
	const box = boxState();
	box.wide = wide;
	// markless-allow MARKLESS_PROJECTION_LIVE_IN_BRANCH: a box is wide or narrow for its whole life, so the arm holding its children never changes
	@if (box.wide) {
		<section>
			<p>Wide box</p>
			{children}
		</section>
	} @else {
		<div>
			<p>Narrow box</p>
			{children}
		</div>
	}
}

export function BoxLabel({ children }: { children?: unknown }) @{
	const box = boxState();
	<span el={box.labelEl}>{children}</span>
}

export function BoxCheck() @{
	const box = boxState();
	<div>
		<button onClick={() => (box.seen = box.labelEl ? `label in ${box.wide ? 'wide' : 'narrow'}` : 'no label')}>Check</button>
		<p>{box.seen}</p>
	</div>
}
