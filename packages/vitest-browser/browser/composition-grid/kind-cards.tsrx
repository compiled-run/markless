import { computed } from '@markless/core';
import { derive, failSave, saveRow, type Board } from './grid-server.ts';

export default function KindCard({ account, kind }: { account: Board; kind: string }) @{
	const caption = computed(() => derive(kind, account));

	<section>
		<p data-g="card">{caption}</p>
		<h4 class={account.parity} data-g="title">{account.title}</h4>
		<button type="button" data-grid-save onClick={async () => await saveRow(account.subject)}>Store</button>
		<button type="button" data-grid-fail onClick={async () => await failSave(account.subject)}>Break</button>
	</section>
}
