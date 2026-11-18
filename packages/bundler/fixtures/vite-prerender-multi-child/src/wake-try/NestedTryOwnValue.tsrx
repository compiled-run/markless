import { computed, state } from '@markless/core';
import { loadLabel } from './stock';

export function App() @{
	let shelf = state(1);
	let bin = state(1);
	const aisle = computed(async () => loadLabel(`aisle${shelf}`));
	const crate = computed(async () => loadLabel(`crate${bin}`));

	<article data-multi-child>
		<button type="button" data-shelf onClick={() => shelf = shelf + 1}>Shelf</button>
		<button type="button" data-bin onClick={() => bin = bin + 1}>Bin</button>
		@try {
			<div>
				@try {
					<p data-crate>{crate.text}</p>
				} @pending {
					<span>Crate waiting</span>
				}
				<h3 data-aisle>{aisle.text}</h3>
			</div>
		} @pending {
			<span>Aisle waiting</span>
		}
	</article>
}
