import { state } from '@markless/core';
import Branch from './tpr-branch.tsrx';

export function App() @{
	let root = state(1);

	<main>
		<Branch id={root} />
	</main>
}
