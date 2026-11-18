import { computed } from '@markless/core';

export default function Results({ ready }: { readonly ready: boolean }) @{
	const rows = computed(() => (ready ? ['one', 'two'] : []));
	<div>
		<ul data-results>
			@for (const row of rows; key row) {
				<li>{row}</li>
			}
		</ul>
		<output data-ready>{ready ? 'yes' : 'no'}</output>
	</div>
}
