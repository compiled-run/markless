import { computed, state } from '@markless/core';
import { twig, type Twig } from './tpr-tree.ts';

function Limb({ item }: { item: Twig }) @{
	let open = state(true);

	<div class="limb">
		<span class="fold" onClick={() => (open = !open)}>[{open ? '-' : '+'}]</span> {item.name}
	</div>
}

export function App() @{
	const item = computed(async () => twig(1));

	<div class="branch">
		@try {
			<Limb item={item} />
		} @pending {
			<p class="wait">loading</p>
		}
	</div>
}
