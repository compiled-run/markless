import { computed } from '@markless/core';

export function UpdateSummary({ updates, weight }) @{
	const weightedCount = computed(() => updates.length * weight);

	<p data-weighted-count>Weighted count {weightedCount}</p>
}
