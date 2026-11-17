import { computed } from '@markless/core';
import { getUser } from './users.ts';

export function Pane({ id }: { id: number }) @{
	const user = computed(async () => await getUser(id));
	<section>
		<p data-plain>{id}</p>
		@try {
			<h2 data-name>{user.name}</h2>
		} @pending {
			<p data-loading>Loading</p>
		}
	</section>
}
