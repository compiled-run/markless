import { computed } from '@markless/core';

export function App() @{
	const rookSignal = computed(async () => {
		const runs = ((globalThis as any).__aviaryFaultRuns ||= { rook: 0, tern: 0, atlas: 0 });
		runs.rook++;
		await new Promise((resolve) => setTimeout(resolve, 25));
		return { bearing: 'rook-west' };
	});
	const ternSignal = computed(async () => {
		const runs = ((globalThis as any).__aviaryFaultRuns ||= { rook: 0, tern: 0, atlas: 0 });
		runs.tern++;
		await new Promise((resolve) => setTimeout(resolve, 45));
		throw new Error('tern beacon dark');
	});
	const flightAtlas = computed(async () => {
		const runs = ((globalThis as any).__aviaryFaultRuns ||= { rook: 0, tern: 0, atlas: 0 });
		runs.atlas++;
		return { route: rookSignal.bearing + ' + ' + ternSignal.bearing };
	});

	<nav>
		@try {
			<cite data-rook-arm>{rookSignal.bearing}</cite>
		} @pending {
			<cite data-rook-arm>Watching rook</cite>
		} @catch {
			<cite data-rook-arm>Rook lost</cite>
		}
		@try {
			<q data-tern-arm>{ternSignal.bearing}</q>
		} @pending {
			<q data-tern-arm>Watching tern</q>
		} @catch {
			<q data-tern-arm>Tern lost</q>
		}
		@try {
			<del data-atlas-arm>{flightAtlas.route}</del>
		} @pending {
			<del data-atlas-arm>Charting flock</del>
		} @catch {
			<del data-atlas-arm>Atlas grounded</del>
		}
	</nav>
}
