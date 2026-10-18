import { state } from '@markless/core';
import { count } from './idle-count.ts';
import { Details, Grid } from './idle-children.tsrx';

export function App() @{
	let events = state(0);
	<main
		onIdle={() => {
			events += 5000;
			count('panel');
		}}
	>
		<output>{events}</output>
		<Grid />
		<Details />
	</main>;
}
