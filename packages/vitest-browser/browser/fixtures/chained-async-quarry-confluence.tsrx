import { computed, state } from '@markless/core';

export function App() @{
	let stratum = state('amber');
	const shaleProbe = computed(async ({ signal }) => {
		const runs = ((globalThis as any).__quarryConfluenceRuns ||= {
			shale: 0,
			crystal: 0,
			mosaic: 0,
			firstSettleSawBothStarted: false,
		});
		runs.shale++;
		const sample = stratum;
		await new Promise((resolve) => setTimeout(resolve, 35));
		runs.firstSettleSawBothStarted ||= runs.shale > 0 && runs.crystal > 0;
		if (signal.aborted) return { texture: 'aborted' };
		return { texture: sample + '-rough' };
	});
	const crystalProbe = computed(async ({ signal }) => {
		const runs = ((globalThis as any).__quarryConfluenceRuns ||= {
			shale: 0,
			crystal: 0,
			mosaic: 0,
			firstSettleSawBothStarted: false,
		});
		runs.crystal++;
		const sample = stratum;
		await new Promise((resolve) => setTimeout(resolve, 70));
		runs.firstSettleSawBothStarted ||= runs.shale > 0 && runs.crystal > 0;
		if (signal.aborted) return { clarity: 'aborted' };
		return { clarity: sample + '-clear' };
	});
	const mosaicCard = computed(async ({ signal }) => {
		const runs = ((globalThis as any).__quarryConfluenceRuns ||= {
			shale: 0,
			crystal: 0,
			mosaic: 0,
			firstSettleSawBothStarted: false,
		});
		runs.mosaic++;
		const blend = shaleProbe.texture + ' / ' + crystalProbe.clarity;
		await new Promise((resolve) => setTimeout(resolve, 15));
		if (signal.aborted) return { inscription: 'aborted' };
		return { inscription: 'Mosaic ' + blend };
	});

	<article>
		<button type="button" data-shift-stratum onClick={() => stratum = 'violet'}>
			Shift stratum
		</button>
		@try {
			<var data-shale-arm>{shaleProbe.texture}</var>
		} @pending {
			<var data-shale-arm>Grinding shale</var>
		} @catch {
			<var data-shale-arm>Shale fracture</var>
		}
		@try {
			<samp data-crystal-arm>{crystalProbe.clarity}</samp>
		} @pending {
			<samp data-crystal-arm>Polishing crystal</samp>
		} @catch {
			<samp data-crystal-arm>Crystal fracture</samp>
		}
		@try {
			<kbd data-mosaic-arm>{mosaicCard.inscription}</kbd>
		} @pending {
			<kbd data-mosaic-arm>Joining tesserae</kbd>
		} @catch {
			<kbd data-mosaic-arm>Mosaic fracture</kbd>
		}
	</article>
}
