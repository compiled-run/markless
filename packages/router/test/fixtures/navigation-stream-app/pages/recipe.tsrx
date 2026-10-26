import { computed } from '@markless/core';
import type { PageProps } from '@markless/router';
import { slow } from '../src/slow.ts';

export default function Recipe({ url }: PageProps) @{
	const u = new URLSearchParams(url.search).get('u') ?? '0';
	const data = computed(async () => slow(`u=${u}`));

	<main data-page="recipe">
		<h1 data-which>{u}</h1>
		<a data-leave href="/quick">to the quick page</a>
		@try {
			<p data-answer>{data.text + ' (' + data.side + ')'}</p>
		} @pending {
			<p data-pending>pending</p>
		}
	</main>
}
