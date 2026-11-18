import { computed } from '@markless/core';
import { loadDetail, type Row } from './grid-server.ts';

export function EntryNote({ entry }: { entry: Row }) @{
	const note = computed(async () => (await loadDetail(entry.id)).note);

	@try {
		<p data-g="row">{entry.label}: {note}</p>
	} @pending {
		<p data-g="row">{entry.label}: loading</p>
	}
}
