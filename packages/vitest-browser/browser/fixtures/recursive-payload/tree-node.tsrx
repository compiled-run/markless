import { state } from '@markless/core';

import type { Tree } from './tree.ts';

export default function TreeNode({ label, kids }: { readonly label: string; readonly kids: readonly Tree[] }) @{
	let open = state(true);
	<div class="node">
		<span class="toggle" onClick={() => (open = !open)}>{open ? '[-]' : '[+]'}</span>
		<span>{label}</span>
		<div hidden={!open}>
			@for (const kid of kids; key kid.id) {
				<TreeNode label={kid.label} kids={kid.kids} />
			}
		</div>
	</div>
}
