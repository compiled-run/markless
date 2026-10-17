import { state } from '@markless/core';
import { BodyRow } from '../src/body-row.tsrx';

export default function CallbackBodyPage() @{
	let calls = state(0);
	<main>
		<BodyRow onActions={() => (calls = calls + 1)} />
		<output data-body-calls>{calls}</output>
	</main>;
}
