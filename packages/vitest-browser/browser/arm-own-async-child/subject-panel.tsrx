import { computed, state } from '@markless/core';
import { loadSubject } from './api.ts';

function SubjectPanel({ id }: { id: number }) @{
	let round = state(0);
	const subject = computed(async () => await loadSubject(id, round));

	<section data-panel>
		@try {
			<div>
				<p data-name>{subject.name}</p>
				<button type="button" data-refresh onClick={() => round++}>Refresh</button>
			</div>
		} @pending {
			<p data-loading>Loading</p>
		} @catch (error, reset) {
			<p data-failed>
				Failed <button type="button" data-retry onClick={reset}>Retry</button>
			</p>
		}
	</section>
}

export default function SubjectPicker({ start = null }: { start?: number | null }) @{
	let open = state<number | null>(start);

	<div>
		<button type="button" data-open-one onClick={() => (open = 1)}>One</button>
		<button type="button" data-open-two onClick={() => (open = 2)}>Two</button>
		<button type="button" data-close onClick={() => (open = null)}>Close</button>
		@if (open !== null) {
			<SubjectPanel id={open} />
		}
	</div>
}
