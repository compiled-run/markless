import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';

export default function Solo({ url }: PageProps) @{
	let picked = state('none');
	const items = computed(() =>
		['a', 'b', 'c'].map((id) => ({ id, label: `${id}${url.pathname}` })),
	);
	<main data-page="solo">
		<output data-picked>{picked}</output>
		<ul data-solo>
			@for (const item of items; key item.id) {
				<li data-row={item.id} onClick={() => (picked = item.id)}>
					{item.label}
				</li>;
			}
		</ul>
	</main>;
}
