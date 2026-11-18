import { computed, state } from '@markless/core';
import { loadNote } from './service.ts';

export function TrimmedList() @{
	let ids = state(['north', 'slow']);

	<div>
		<ul>
			@for (const id of ids; key id) {
				<Row label={id.trim()} />
			}
		</ul>
		<ul>
			@for (const id of ids; key id) {
				<PlainRow label={id.trim()} />
			}
		</ul>
		<button type="button" data-add onClick={() => (ids = [...ids, 'east'])}>Add</button>
	</div>
}

export function Row({ label }: { label: string }) @{
	let tries = state(1);
	const note = computed(async () => await loadNote(label));

	<li data-row={label}>
		@try {
			<p data-text>{label}: {note} try {tries}</p>
		} @pending {
			<p data-pending>Loading {label}</p>
		}
		<span data-count>{tries}</span>
		<button type="button" data-next onClick={() => tries++}>Next</button>
	</li>
}

export function PlainRow({ label }: { label: string }) @{
	let tries = state(1);

	<li data-plain={label}>
		<p data-text>{label} try {tries}</p>
		<span data-count>{tries}</span>
		<button type="button" data-next onClick={() => tries++}>Next</button>
	</li>
}
