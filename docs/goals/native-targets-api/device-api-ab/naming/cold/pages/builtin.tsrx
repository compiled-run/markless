import { state } from '@markless/core';
import { camera } from '@markless/device';
import { drawer, tabs } from '@markless/ui';
import { builtin } from '@markless/builtin';
import { Filters } from './Filters.tsrx';

export default function Receipts() @{
	let tab = state('scan');
	let filtersOpen = state(false);
	let tipsOpen = state(false);
	let shown = state<string | null>(null);
	const cam = camera();

	<main>
		<tabs.root value={tab} onChange={(value) => (tab = value)}>
			<tabs.list>
				<tabs.trigger value="scan">Scan</tabs.trigger>
				<tabs.trigger value="saved">Saved</tabs.trigger>
			</tabs.list>
			<tabs.content value="scan">
				<builtin.camera el={cam} />
				<button onClick={() => cam.takePhoto()}>Scan receipt</button>
			</tabs.content>
			<tabs.content value="saved">
				<button onClick={() => (filtersOpen = true)}>Filter</button>
				<button onClick={() => (shown = 'march.pdf')}>March statement</button>
				@if (shown) {
					<builtin.pdf src={`/statements/${shown}`} />
				}
			</tabs.content>
		</tabs.root>

		<builtin.sheet open={filtersOpen} onChange={(open) => (filtersOpen = open)}>
			<Filters />
		</builtin.sheet>

		<drawer.root open={tipsOpen} onChange={(open) => (tipsOpen = open)}>
			<drawer.trigger>Scanning tips</drawer.trigger>
			<drawer.backdrop>
				<drawer.content>
					<drawer.title>Scanning tips</drawer.title>
					<p>Flatten the receipt and fill the frame.</p>
					<drawer.close>Got it</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
	</main>
}
