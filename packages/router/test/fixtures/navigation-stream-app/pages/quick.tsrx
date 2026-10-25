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
	</main>
}
