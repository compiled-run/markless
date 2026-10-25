import { computed } from '@markless/core';
import AsyncOuter from './async-outer.tsrx';

export default function AsyncInner({ depth }: { depth: number }) @{
	const label = computed(async () => `level ${depth}`);
	const deeper = computed(() => (depth > 0 ? [depth - 1] : []));

	<div data-inner>
		@try {
			<span data-label>{label}</span>
		} @pending {
			<span data-label-pending>...</span>
		}
		@for (const next of deeper; key next) {
			<AsyncOuter depth={next} />
		}
	</div>
}
