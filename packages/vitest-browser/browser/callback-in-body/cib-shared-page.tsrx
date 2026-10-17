import { state } from '@markless/core';
import { panels } from './cib-shared.tsrx';
import { Trigger } from './cib-trigger.tsrx';

export default function SharedPage() @{
	const m = panels();
	let calls = state(0);
	<section>
		<Trigger slot={1} onActions={() => (calls = calls + 1)} />
		<Trigger slot={2} onActions={() => (calls = calls + 10)} />
		<output data-shared-calls>{calls}</output>
		<output data-shared-at>{m.at}</output>
	</section>
}
