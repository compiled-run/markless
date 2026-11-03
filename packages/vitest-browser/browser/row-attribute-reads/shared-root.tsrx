import { selection } from './selection.tsrx';

const ITEMS = [
	{ name: 'lyra', label: 'Lyra' },
	{ name: 'maia', label: 'Maia' },
	{ name: 'nova', label: 'Nova' },
];

export default function SharedRows() @{
	const picked = selection();
	<ul>
		@for (const item of ITEMS; key item.name) {
			<li data-item={item.name} data-checked={picked.name === item.name ? 'true' : 'false'} onClick={() => picked.name = item.name}>{item.label}</li>
		}
	</ul>
}
