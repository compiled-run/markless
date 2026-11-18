import { computed } from '@markless/core';
import { selection } from './selection.tsrx';

const ITEMS = [
	{ name: 'lyra', label: 'Lyra' },
	{ name: 'maia', label: 'Maia' },
	{ name: 'nova', label: 'Nova' },
];

function ChildSharedRows() @{
	const picked = selection();
	const name = computed(() => picked.name);
	<ul>
		@for (const item of ITEMS; key item.name) {
			<li data-item={item.name} data-checked={name === item.name ? 'true' : 'false'} onClick={() => picked.name = item.name}>{item.label}</li>
		}
	</ul>
}

export default function SharedChildPage() @{
	const picked = selection();
	<main>
		<output data-current>{picked.name}</output>
		<ChildSharedRows />
	</main>
}
