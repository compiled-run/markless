import { state } from '@markless/core';
import type { PageProps } from '@markless/router';
import { ComponentList } from '../src/lists.tsrx';

export default function Page({ url }: PageProps) @{
	let count = state(0);
	const rows = Number(new URLSearchParams(url.search).get('rows') ?? 100);

	<main>
		<button class="tap" onClick={() => count++}>Count {count}</button>
		<ComponentList rows={rows} />
	</main>
}
