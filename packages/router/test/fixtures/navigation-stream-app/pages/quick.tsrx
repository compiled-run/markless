import { computed } from '@markless/core';
import { quick } from '../src/slow.ts';

export default function Quick() @{
	const data = computed(async () => quick('page'));

	<main data-page="quick">
		@try {
			<p data-answer>{data.text}</p>
		} @pending {
			<p data-pending>pending</p>
		}
		<div style="height: 3000px">spacer</div>
		<a data-to-recipe href="/recipe?u=4">to the slow page</a>
		<a data-to-spot href="/#spot">to a spot on the start page</a>
	</main>
}
