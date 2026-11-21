import { element, state } from '@markless/core';
import { report } from './report.ts';

const PILE = ['red', 'blue', 'red', 'green'].map((colour, id) => ({ id, colour }));

export default function Gauntlet() @{
	let glove = state(new Set<string>());
	let pile = state(PILE.slice());
	const fist = element<HTMLDivElement>();
	const seated = element<HTMLElement[]>();

	function place({ id, colour }: { id: number; colour: string }) {
		if (glove.has(colour)) return;
		glove.add(colour);
		pile = pile.filter((g) => g.id !== id);
		report(fist!, seated);
	}

	<section class="gauntlet">
		<div el={fist} class="fist" onDragOver={(e) => e.preventDefault()}>
			@for (const colour of glove; key colour) {
				<i el={seated} class={colour}>{colour}</i>
			}
		</div>
		<p>{glove.size} of 3</p>
		<div class="pile">
			@for (const gem of pile; key gem.id) {
				<button class={gem.colour} data-op={gem.id === 0 ? 'add' : undefined} onClick={() => place(gem)}>{gem.colour}</button>
			}
		</div>
		<button class="snap" disabled={glove.size < 3} onClick={() => glove.clear()}>Snap</button>
	</section>
}
