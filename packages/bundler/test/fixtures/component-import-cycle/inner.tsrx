import { computed } from '@markless/core';
import Outer from './outer.tsrx';

export default function Inner({ depth }: { depth: number }) @{
	const deeper = computed(() => (depth > 0 ? [depth - 1] : []));

	<div data-inner>
		{depth}
		@for (const next of deeper; key next) {
			<Outer depth={next} />
		}
	</div>
}
