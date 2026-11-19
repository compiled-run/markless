import { state } from '@markless/core';
import { Shelf } from './shelf.tsrx';

export default function ThreeLevels() @{
	let chosen = state('none');

	<div>
		<Shelf onChoose={(title) => (chosen = title)} />
		<output data-chosen>{chosen}</output>
	</div>
}
