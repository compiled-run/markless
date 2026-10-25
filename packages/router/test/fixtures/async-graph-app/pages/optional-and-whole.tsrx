import { computed } from '@markless/core';
import { slow } from '../src/slow.ts';

export default function OptionalAndWholePage() @{
	const data = computed(async () => slow('json', 100));

	<main>
		@try {
			<>
				<h4 data-heading>{data?.text}</h4>
				<pre data-json>{JSON.stringify(data)}</pre>
			</>
		} @pending {
			<p data-pending>pending</p>
		}
	</main>
}
