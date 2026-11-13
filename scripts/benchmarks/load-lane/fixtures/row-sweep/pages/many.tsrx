import { state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { PlainList } from '../src/lists.tsrx';

export default function Page({ url }: PageProps) @{
	let count = state(0);
	const rows = Number(new URLSearchParams(url.search).get('rows') ?? 100);
	const listCount = Number(new URLSearchParams(url.search).get('lists') ?? 20);
	const lists = state(Array.from({ length: listCount }, (_, index) => index));

	<main>
		<button class="tap" onClick={() => count++}>Count {count}</button>
		<div class="lists">
			@for (const list of lists; key list) {
				<PlainList rows={rows} />
			}
		</div>
	</main>
}
