import { computed } from '@markless/core';
import { loadDetail, type Row } from './grid-server.ts';

export default function RowDetail({ row }: { row: Row }) @{
	const detail = computed(async () => await loadDetail(row.id));

	<li>
		@try {
			<span data-g="row">{row.label}: {detail.note}</span>
		} @pending {
			<span data-g="row">{row.label}: loading</span>
		}
	</li>
}
