import { state } from '@markless/core';
import Outer from './outer.tsrx';

export default function Page() @{
	let depth = state(2);

	<main>
		<Outer depth={depth} />
	</main>
}
