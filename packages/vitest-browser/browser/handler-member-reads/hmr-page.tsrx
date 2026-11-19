import { element, state } from '@markless/core';
import { layout, mark } from './mark.ts';

export default function MemberReadsPage() @{
	const worn = state<string[]>(['red']);
	const gems = element<HTMLElement[]>();
	const lead = element<HTMLElement>();
	const view = state({ place: 0 });
	const drag = state({ from: 0 });
	function place(colour: string) {
		worn.push(colour);
		mark(gems?.at(-1), colour);
	}

	<section>
		<ul>
			@for (const colour of worn; key colour) {
				<li el={gems} data-gem={colour}>{colour}</li>
			}
		</ul>
		<b el={lead}>lead</b>
		<button data-add type="button" onClick={() => place('blue')}>add</button>
		<button data-first type="button" onClick={() => mark(gems[0], 'first')}>first</button>
		<button data-lead type="button" onClick={() => lead?.setAttribute('data-marked', 'lead')}>lead</button>
		<button data-next type="button" onClick={() => { view.place = view.place + 1; }}>next</button>
		<button data-measure type="button" onPointerDown={() => { drag.from = layout.places[view.place].y; }}>measure</button>
		<output data-from>{drag.from}</output>
	</section>
}
