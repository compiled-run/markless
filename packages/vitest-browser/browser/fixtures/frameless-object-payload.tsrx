import { state } from '@markless/core';

function PayloadButton({ onTrace }) @{
	let count = state(0);

	<button type="button" data-object-payload-send onClick={() => {
		count++;
		onTrace({ count });
	}}>send payload</button>
}

export default function App() @{
	let observed = state(0);

	<section data-object-payload-app>
		<PayloadButton onTrace={(payload) => observed = payload.count} />
		<output data-object-payload-value>{observed}</output>
	</section>
}
