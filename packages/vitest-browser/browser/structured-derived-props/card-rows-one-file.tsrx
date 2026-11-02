import { computed, state } from '@markless/core';

function Shell({ entry }: { readonly entry: { readonly id: number; readonly title: string; readonly tags: ReadonlyArray<string> } }) @{
	<div><Tag entry={entry} /></div>
}

function Tag({ entry }: { readonly entry: { readonly id: number; readonly title: string; readonly tags: ReadonlyArray<string> } }) @{
	const seen = state({ count: 0 });
	const label = computed(() => entry.title + ' [' + entry.tags.join('+') + '] ' + seen.count);
	<button type="button" data-card={entry.id} onClick={() => { seen.count = seen.count + 1; }}>{label}</button>
}

export default function CardRowsOneFile() @{
	const entries = state([
		{ id: 1, title: 'alpha-card-title', tags: ['p', 'q'] },
		{ id: 2, title: 'beta-card-title', tags: ['r'] },
	]);
	<ul>
		@for (const entry of entries; key entry.id) {
			<li><Shell entry={entry} /></li>
		}
	</ul>
}
