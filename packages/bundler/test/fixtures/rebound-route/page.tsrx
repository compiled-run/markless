import { state } from '@markless/core';
import { RelayRow } from './relay-row.tsrx';

export default function RelayPage() @{
	let picked = state(0);
	<section>
		<RelayRow label="r1" onPicked={() => (picked = picked + 1)} />
		<RelayRow label="r2" onPicked={() => (picked = picked + 10)} />
		<output data-picked>{picked}</output>
	</section>
}
