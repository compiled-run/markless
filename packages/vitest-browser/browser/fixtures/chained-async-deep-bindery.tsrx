import { computed, state } from '@markless/core';

export function App() @{
	let fiber = state('flax');
	const leafStock = computed(async ({ signal }) => {
		const runs = ((globalThis as any).__deepBinderyRuns ||= { a: 0, b: 0, c: 0 });
		runs.a++;
		const grain = fiber;
		await new Promise((resolve) => setTimeout(resolve, 15));
		if (signal.aborted) return { tooth: 'aborted' };
		return { tooth: grain + '-fold' };
	});
	const signatureStack = computed(async ({ signal }) => {
		const runs = ((globalThis as any).__deepBinderyRuns ||= { a: 0, b: 0, c: 0 });
		runs.b++;
		const fold = leafStock.tooth;
		await new Promise((resolve) => setTimeout(resolve, 25));
		if (signal.aborted) return { sewing: 'aborted' };
		return { sewing: fold + '-sewn' };
	});
	const volumeCard = computed(async ({ signal }) => {
		const runs = ((globalThis as any).__deepBinderyRuns ||= { a: 0, b: 0, c: 0 });
		runs.c++;
		const stitching = signatureStack.sewing;
		await new Promise((resolve) => setTimeout(resolve, 35));
		if (signal.aborted) return { colophon: 'aborted' };
		return { colophon: 'Volume ' + stitching };
	});

	<details open>
		<button type="button" data-switch-fiber onClick={() => fiber = 'cotton'}>Switch fiber</button>
		@try {
			<bdi data-volume-arm>{volumeCard.colophon}</bdi>
		} @pending {
			<bdi data-volume-arm>Stitching volume</bdi>
		} @catch {
			<bdi data-volume-arm>Binding spoiled</bdi>
		}
	</details>
}
