import { computed, state } from '@markless/core';
import { recordLabel } from './api.ts';

function LabelPanel({ id }: { id: number }) @{
	let count = state(0);
	const label = computed(() => recordLabel(id, count));

	<section data-panel>
		<p data-name>{label}</p>
		<button type="button" data-refresh onClick={() => count++}>Bump</button>
	</section>
}

export default function LabelPicker() @{
	let open = state<number | null>(null);

	<div>
		<button type="button" data-open-one onClick={() => (open = 1)}>One</button>
		<button type="button" data-close onClick={() => (open = null)}>Close</button>
		@if (open !== null) {
			<LabelPanel id={open} />
		}
	</div>
}
