import { computed } from '@markless/core';

export default function SharedPage() @{
	const forecast = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 60));
		return { high: '21C', low: '9C' };
	});
	<main>
		<section>
			@try {
				<strong data-high>{forecast.high}</strong>;
			} @pending {
				<span data-skeleton>high pending</span>;
			}
		</section>
		<aside>
			@try {
				<strong data-low>{forecast.low}</strong>;
			} @pending {
				<span data-skeleton>low pending</span>;
			}
		</aside>
	</main>;
}
