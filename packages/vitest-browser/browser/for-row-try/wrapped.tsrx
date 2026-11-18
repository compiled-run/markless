import { computed } from '@markless/core';

export function Wrapped({ label }: { label: string }) @{
	const details = computed(async () => {
		await new Promise((done) => setTimeout(done, 10));
		return label + '!';
	});
	<span>
		@try {
			<b>{details}</b>
		} @pending {
			<i>wait</i>
		}
	</span>
}
