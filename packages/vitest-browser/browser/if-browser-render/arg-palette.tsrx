import { state } from '@markless/core';

const ITEMS = [
	{ name: 'lyra', label: 'Lyra' },
	{ name: 'maia', label: 'Maia' },
	{ name: 'nova', label: 'Nova' },
];

export default function Palette() @{
	let mounted = state(true);
	let current = state('maia');
	<section>
		<button type="button" data-toggle onClick={() => mounted = !mounted}>Palette</button>
		<output data-current>{current}</output>
		@if (mounted) {
			<ul data-list>
				@for (const item of ITEMS; key item.name) {
					<li data-item={item.name} data-checked={current === item.name ? 'true' : 'false'} onClick={() => current = item.name}>{item.label}</li>
				}
			</ul>
		}
	</section>
}
