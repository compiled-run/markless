import { computed, state } from '@markless/core';

export function App() @{
	let glaze = state('cobalt');
	const kilnGauge = computed(async ({ signal }) => {
		const runs = ((globalThis as any).__kilnResumeRuns ||= { gauge: 0, plaque: 0 });
		runs.gauge++;
		const batch = glaze;
		await new Promise((resolve) => setTimeout(resolve, 90));
		if (signal.aborted) return { tone: 'aborted' };
		return { tone: batch + '-fired' };
	});
	const galleryPlaque = computed(async ({ signal }) => {
		const runs = ((globalThis as any).__kilnResumeRuns ||= { gauge: 0, plaque: 0 });
		runs.plaque++;
		const tone = kilnGauge.tone;
		await new Promise((resolve) => setTimeout(resolve, 20));
		if (signal.aborted) return { label: 'aborted' };
		return { label: 'Plaque ' + tone };
	});

	<figure>
		<button type="button" data-change-glaze onClick={() => glaze = 'ochre'}>Change glaze</button>
		@try {
			<meter data-gauge-arm>{kilnGauge.tone}</meter>
		} @pending {
			<meter data-gauge-arm>Heating kiln</meter>
		} @catch {
			<meter data-gauge-arm>Kiln cold</meter>
		}
		@try {
			<figcaption data-plaque-arm>{galleryPlaque.label}</figcaption>
		} @pending {
			<figcaption data-plaque-arm>Lettering plaque</figcaption>
		} @catch {
			<figcaption data-plaque-arm>Plaque blank</figcaption>
		}
	</figure>
}
