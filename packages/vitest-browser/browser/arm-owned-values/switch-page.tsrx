import { state } from '@markless/core';
import Panel from './panel.tsrx';

export default function SwitchPage() @{
	let mode = state('a');
	let id = state(1);

	<div>
		<button type="button" data-to-b onClick={() => ((mode = 'b'), (id = 2))}>To b</button>
		<button type="button" data-to-a onClick={() => ((mode = 'a'), (id = 3))}>To a</button>
		@switch (mode) {
			@case 'a': {
				<Panel tag="a" id={id} />
			}
			@case 'b': {
				<Panel tag="b" id={id} />
			}
		}
	</div>
}
