import { state } from '@markless/core';

const ITEMS = [
	{ name: 'lyra', label: 'Lyra' },
	{ name: 'maia', label: 'Maia' },
	{ name: 'nova', label: 'Nova' },
];

export function ResetDialog() @{
	let asked = state(false);
	<div role="alertdialog">
		<button type="button" data-ask onClick={() => asked = !asked}>{asked ? 'Asked' : 'Ask'}</button>
	</div>
}

export function Palette() @{
	let mounted = state(true);
	let current = state('maia');
	<div data-palette>
		<button type="button" data-toggle onClick={() => mounted = !mounted}>Palette</button>
		<button type="button" data-reset onClick={() => current = 'maia'}>Reset</button>
		<output data-current>{current}</output>
		@if (mounted) {
			<PaletteRows current={current} onPick={(name) => current = name} />
		}
	</div>
}

function PaletteRows({ current, onPick }: { readonly current: string; readonly onPick: (name: string) => void }) @{
	<ul data-list>
		@for (const item of ITEMS; key item.name) {
			<li data-item={item.name} data-checked={current === item.name ? 'true' : 'false'} onClick={() => onPick(item.name)}>{item.label}</li>
		}
	</ul>
}
