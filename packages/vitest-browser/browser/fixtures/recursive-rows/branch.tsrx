import { state } from '@markless/core';
import type { Branch as Data } from './tree.ts';

export default function Branch({ title, branches }: { readonly title: string; readonly branches: readonly Data[] }) @{
	let open = state(true);
	<article data-branch={title}>
		<button type="button" data-fold onClick={() => (open = !open)}>{open ? 'fold' : 'unfold'}</button>
		<h3>{title}</h3>
		<section hidden={!open}>
			@for (const branch of branches; key branch.id) {
				<Branch title={branch.title} branches={branch.branches} />
			}
		</section>
	</article>
}
