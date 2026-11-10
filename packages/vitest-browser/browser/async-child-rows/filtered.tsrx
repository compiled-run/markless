import { state } from '@markless/core';
import { Shelf } from './shelf.tsrx';

export function Filtered({ initial }: { initial: string }) @{
	let filter = state(initial);

	<div>
		<input value={filter} onInput={(event) => (filter = (event.target as HTMLInputElement).value)} />
		@for (const which of [filter]; key which) {
			<Shelf tag={which} version={0} />
		}
	</div>
}
