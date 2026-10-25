import { state } from '@markless/core';
import { Toggle } from './async-pair.tsrx';

export default function AsyncPairPage() @{
	let depth = state(2);

	<main>
		<Toggle depth={depth} />
	</main>
}
