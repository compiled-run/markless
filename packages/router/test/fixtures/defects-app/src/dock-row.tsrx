import { computed } from '@markless/core';

export function DockRow({ berth }) @{
	const vessel = computed(async () => {
		const at = berth;
		await new Promise((resolve) => setTimeout(resolve, 80 + at * 20));
		return { title: 'vessel ' + at };
	});
	<li class="dock">
		@try {
			<span data-vessel>{vessel.title}</span>
		} @pending {
			<span data-vessel-wait>waiting {berth}</span>
		}
	</li>
}
