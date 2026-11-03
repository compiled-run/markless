import { state } from '@markless/core';

const ITEMS = [
	{ name: 'lyra', label: 'Lyra' },
	{ name: 'maia', label: 'Maia' },
	{ name: 'nova', label: 'Nova' },
];

function DirectRows({ current, onPick }: { readonly current: string; readonly onPick: (name: string) => void }) @{
	<ul data-list="direct">
		@for (const item of ITEMS; key item.name) {
			<li data-item={item.name} data-checked={current === item.name ? 'true' : 'false'} onClick={() => onPick(item.name)}>{item.label}</li>
		}
	</ul>
}

export default function Page() @{
	let current = state('maia');
	<main>
		<output data-current>{current}</output>
		<DirectRows current={current} onPick={(name) => current = name} />
	</main>
}
