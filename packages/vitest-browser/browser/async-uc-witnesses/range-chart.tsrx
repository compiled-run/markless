import { computed, state } from '@markless/core';
import { answer } from '../matched-values/gates.ts';

const sold: Record<string, ReadonlyArray<readonly [number, number]>> = {
	'7d': [[0, 3], [2, 4], [6, 9]],
	'30d': [[1, 2], [29, 7]],
};

function fillDays(byDay: ReadonlyArray<readonly [number, number]>, days: number): number[] {
	const bars = Array.from({ length: days }, () => 0);
	for (const [day, count] of byDay) if (day < days) bars[day] = count;
	return bars;
}

export function RangeChart() @{
	let range = state('7d');
	const sales = computed(async () => {
		const asked = range;
		return answer(`sales:${asked}`, { range: asked, byDay: sold[asked]! });
	});
	const bars = computed(() => fillDays(sales.byDay, range === '7d' ? 7 : 30));

	<section>
		<button type="button" data-month onClick={() => (range = '30d')}>30d</button>
		@try {
			<div data-chart style={`transition: width 40ms linear; height: 4px; width: ${bars.length * 4}px`}>
				<p data-bars>{bars.join(' ')}</p>
			</div>
		} @pending {
			<p data-pending>Loading</p>
		}
	</section>
}
