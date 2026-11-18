import { loadDetail, type Row } from './grid-server.ts';

export default function PickRow({ row }: { row: Row }) @{
	<li data-g="row">
		{row.label}
		<button type="button" data-pick aria-label="Pick" onClick={async () => await loadDetail(row.id)}></button>
	</li>
}
