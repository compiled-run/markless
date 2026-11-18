import { computed, state } from '@markless/core';

const ITEMS = [
	{ name: 'lyra', label: 'Lyra' },
	{ name: 'maia', label: 'Maia' },
	{ name: 'nova', label: 'Nova' },
];

function Palette({ current, onPick }: { readonly current: string; readonly onPick: (name: string) => void }) @{
	let mounted = state(true);
	const picked = computed(() => current);
	<div>
		<button type="button" data-toggle onClick={() => mounted = !mounted}>Palette</button>
		@if (mounted) {
			<ul data-list>
				@for (const item of ITEMS; key item.name) {
					<li data-item={item.name} data-checked={picked === item.name ? 'true' : 'false'} onClick={() => onPick(item.name)}>{item.label}</li>
				}
			</ul>
		}
	</div>
}

export default function Page() @{
	let current = state('maia');
	<main>
		<output data-current>{current}</output>
		<Palette current={current} onPick={(name) => current = name} />
	</main>
}
