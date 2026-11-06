import { computed } from '@markless/core';
import { getDetail } from './gate.ts';

export default function Detail({ id, reload }: { id: string; reload: number }) @{
	const text = computed(async () => await getDetail(id, reload));

	<li>
		@try {
			<span data-detail={id}>{text}</span>
		} @pending {
			<span data-detail={id}>wait</span>
		} @catch (error) {
			<span data-detail={id}>{`error: ${error.message}`}</span>
		}
	</li>
}
