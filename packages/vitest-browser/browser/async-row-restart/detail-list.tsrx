import { state } from '@markless/core';
import Detail from './detail.tsrx';

export default function DetailList({ reload }: { reload: number }) @{
	let open = state<string[]>([]);

	<div>
		<button data-open onClick={() => (open = [...open, open.length === 0 ? 'ada' : 'grace'])}>Open</button>
		<ul>
			@for (const id of open; key id) {
				<Detail id={id} reload={reload} />
			}
		</ul>
	</div>
}
