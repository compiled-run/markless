import { state } from '@markless/core';
import { startFeed } from './feed.ts';

export function SocketPatchPage() @{
	let items = state([{ id: 1, n: 0 }, { id: 2, n: 0 }]);
	let received = state(0);

	<section attach={() => startFeed((patch) => {
		received++;
		const item = items.find((candidate) => candidate.id === patch.id);
		if (item) item.n = patch.n;
		else items.push({ id: patch.id, n: patch.n });
	}, [{ id: 2, n: 5 }, { id: 3, n: 1 }, { id: 2, n: 6 }])} onVisible={() => {}}>
		<ul>
			@for (const item of items; key item.id) {
				<li data-item={item.id}>{item.n}</li>
			}
		</ul>
		<output data-received>{received}</output>
	</section>
}
