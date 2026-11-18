import type { Children } from '@markless/core';
import { computed, state } from '@markless/core';

const ITEMS = [
	{ name: 'lyra', label: 'Lyra' },
	{ name: 'maia', label: 'Maia' },
	{ name: 'nova', label: 'Nova' },
];

function Palette(props: { readonly current: string; readonly onPick: (name: string) => void }) @{
	let mounted = state(true);
	const picked = computed(() => props.current);
	<div>
		<button type="button" data-toggle onClick={() => mounted = !mounted}>Palette</button>
		@if (mounted) {
			<ul data-list>
				@for (const item of ITEMS; key item.name) {
					<li data-item={item.name} data-checked={picked === item.name ? 'true' : 'false'} onClick={() => props.onPick(item.name)}>{item.label}</li>
				}
			</ul>
		}
	</div>
}

function Layer({ children }: { readonly children: Children }) @{
	<section role="dialog">{children}</section>
}

export default function Page() @{
	let current = state('maia');
	<main>
		<output data-current>{current}</output>
		<Layer>
			<Palette current={current} onPick={(name) => current = name} />
		</Layer>
	</main>
}
