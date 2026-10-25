import Ledger from './ledger.tsrx';

const GROUPS = [{ id: 'first', shown: true }, { id: 'second', shown: true }];

export default function RowArmPage() @{
	<main>
		@for (const group of GROUPS; key group.id) {
			<div class="group">@if (group.shown) { <><Ledger id={group.id} /></> }</div>
		}
	</main>
}
