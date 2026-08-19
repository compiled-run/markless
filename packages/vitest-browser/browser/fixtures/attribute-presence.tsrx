import { state } from '@markless/core';
import Part from './presence-part.tsrx';
import BranchPart from './presence-branch-part.tsrx';

export function App() @{
	let blocked = state(false);

	<main>
		<Part label="omitted">a</Part>
		<Part label="false" disabled={false}>b</Part>
		<Part label="true" disabled={true}>c</Part>
		<Part label="flip" disabled={blocked}>d</Part>
		<BranchPart />
		<button type="button" data-flip onClick={() => blocked = !blocked}>flip</button>
	</main>
}
