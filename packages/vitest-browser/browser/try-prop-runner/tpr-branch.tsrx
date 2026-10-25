import { computed, state } from '@markless/core';
import { twig, type Twig } from './tpr-tree.ts';

function Limb({ item }: { item: Twig }) @{
	let open = state(true);

	<div class="limb">
		<span class="fold" onClick={() => (open = !open)}>[{open ? '-' : '+'}]</span> {item.name}
		<div class="kids">
			@for (const kid of item.kids; key kid) {
				<Branch id={kid} />
			}
		</div>
	</div>
}

export default function Branch({ id }: { id: number }) @{
	const item = computed(async () => twig(id));

	<div class="branch">
		@try {
			<Limb item={item} />
		} @pending {
			<p class="wait">loading {id}</p>
		} @catch {
			<p>failed</p>
		}
	</div>
}
