import { computed } from '@markless/core';
import { loadMugs, saveMug } from './mugs.ts';

export default function Mugs() @{
	const mugs = computed(async () => await loadMugs());

	<section>
		@try {
			<div>
				<ul>
					@for (const mug of mugs; key mug.id) {
						<li>{mug.name}</li>
					}
				</ul>
				<button onClick={async () => await saveMug('Tall mug')}>
					Add a tall mug
				</button>
			</div>
		} @pending {
			<p>Counting mugs</p>
		} @catch (error) {
			<p>{error.message}</p>
		}
	</section>
}
