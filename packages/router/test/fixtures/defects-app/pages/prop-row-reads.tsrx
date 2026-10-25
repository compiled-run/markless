import { computed, state } from '@markless/core';
import type { PageProps } from '@markless/router';

export default function PropRowReads({ url }: PageProps) @{
	let version = state(0);
	const rows = computed(async () => {
		const v = version;
		return [{ id: 1, name: `one v${v}` }, ...(v > 0 ? [{ id: 2, name: 'two' }] : [])];
	});
	<main>
		<button type="button" data-bump onClick={() => version++}>bump</button>
		<ul>
			@try {
				@for (const row of rows; key row.id) {
					<li class={url.pathname === '/prop-row-reads' ? 'here' : 'there'}>{row.name}</li>
				}
			} @pending {
				<li>pending</li>
			}
		</ul>
	</main>
}
