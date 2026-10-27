import { state } from '@markless/core';

export function Tabs() @{
	let tab = state('a');
	let hits = state(0);

	<section>
		<button data-b onClick={() => (tab = 'b')}>B</button>
		<button data-hit onClick={() => (hits = hits + 1)}>Hit</button>
		@switch (tab) {
			@case 'a': {
				const text = `a ${hits}`;
				<p data-panel>{text}</p>
			}
			@default: {
				const text = `other ${hits}`;
				<p data-panel>{text}</p>
			}
		}
	</section>
}
