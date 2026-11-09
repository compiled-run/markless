import { computed } from '@markless/core';
import { getFigure } from './gate.ts';

export default function Figure({ range, reload }: { range: string; reload: number }) @{
	const value = computed(async () => await getFigure(range, reload));

	<p>
		@try {
			<span data-figure>{value}</span>
		} @pending {
			<span>wait</span>
		}
	</p>
}
