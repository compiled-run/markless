import { state } from '@markless/core';
import AsyncOuter from './async-outer.tsrx';

export default function AsyncPage() @{
	let depth = state(2);

	<main>
		<AsyncOuter depth={depth} />
	</main>
}
