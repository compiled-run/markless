import { computed, state } from '@markless/core';
import { loadSubject, nextLabel, recordLabel } from './api.ts';

function HeldPanel({ id }: { id: number }) @{
	const label = computed(() => recordLabel(id, 0));
	const subject = computed(async () => await loadSubject(id, 0));

	<section data-panel>
		<p data-label>{label}</p>
		@try {
			<p data-name>{subject.name}</p>
		} @pending {
			<p data-loading>Loading</p>
		}
	</section>
}

export default function HeldPicker() @{
	let open = state<number | null>(null);

	<div>
		<button type="button" data-open-one onClick={() => (open = 1)}>One</button>
		<button type="button" data-close onClick={() => (open = null)}>Close</button>
		<button
			type="button"
			data-open-then-close
			onClick={async () => {
				open = 1;
				await nextLabel();
				open = null;
			}}
		>
			Peek
		</button>
		@if (open !== null) {
			<HeldPanel id={open} />
		}
	</div>
}
