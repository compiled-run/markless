import { state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { rows } from '../lib/rows.ts';

export default function Visit({ url }: PageProps) @{
	let clicks = state(0);

	<main attach={() => () => {}}>
		<a class="next" href={`/visit?n=${Number(new URLSearchParams(url.search).get('n') ?? 0) + 1}`}>next</a>
		<button class="count" onClick={() => clicks++}>{clicks}</button>
		<ol>
			@for (const row of rows; key row.id) {
				<li>{row.label}</li>
			}
		</ol>
	</main>
}
