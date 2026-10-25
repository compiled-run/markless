import { state } from '@markless/core';
import RingB from './ring-b.tsrx';

export default function RingA({ left }: { left: number }) @{
	let hits = state(0);

	<section data-ring-a>
		<a href="#" data-ring-hit onClick={(event) => { event.preventDefault(); hits++; }}>{hits}</a>
		<RingB left={left} />
	</section>
}
