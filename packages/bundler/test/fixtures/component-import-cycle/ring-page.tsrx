import { state } from '@markless/core';
import RingA from './ring-a.tsrx';

export default function RingPage() @{
	let left = state(2);

	<main>
		<RingA left={left} />
	</main>
}
