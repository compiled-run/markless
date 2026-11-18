import { state } from '@markless/core';
import Detail from './detail.tsrx';

export default function OpenDetailList({ reload }: { reload: number }) @{
	let open = state<string[]>(['ada']);

	<div>
		<button data-open onClick={() => (open = [...open, open.length === 0 ? 'ada' : 'grace'])}>Open</button>
		<ul>
			@for (const id of open; key id) {
				<Detail id={id} reload={reload} />
			}
		</ul>
	</div>
}
