import { state } from '@markless/core';
import { Row } from './cib-row.tsrx';

export default function Page() @{
	let calls = state(0);
	<section>
		<Row label="one" onActions={() => (calls = calls + 1)} />
		<output data-calls>{calls}</output>
	</section>
}
