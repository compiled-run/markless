import { state } from '@markless/core';
import PickLine from './pick-line.tsrx';

export default function Picked() @{
	let items = state(['x', 'y']);
	let picked = state(-1);
	<div>
		<button data-front onClick={() => (items = ['w', ...items])}>front</button>
		<output data-picked>{picked}</output>
		@for (const item of items; index place; key item) {
			<PickLine label={item} onPick={() => (picked = place)} />
		}
	</div>
}
