import { computed } from '@markless/core';
import Badge from './badge.tsrx';

// An @try arm that settles in the browser holds a component.
export default function TryPanel() @{
	const ready = computed(async () => {
		await new Promise((done) => setTimeout(done, 300));
		return 'ready';
	});

	<section>
		@try {
			<div class="settled">
				<p>{ready}</p>
				<Badge />
			</div>
		} @pending {
			<p class="waiting">waiting</p>
		}
	</section>
}
