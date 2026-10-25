import { computed } from '@markless/core';
import RingA from './ring-a.tsrx';

export default function RingC({ left }: { left: number }) @{
	const more = computed(() => (left > 0 ? [left - 1] : []));

	<aside data-ring-c data-left={left}>
		@for (const rest of more; key rest) {
			<RingA left={rest} />
		}
	</aside>
}
