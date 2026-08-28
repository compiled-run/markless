import { state } from '@markless/core';
import { Caption, Note } from './family/caption.tsrx';

// The same shape with no async boundary around it: the branch record travels the
// page-branch road, which already carries the composed prop route table.
export default function ComposedArmControlPage() @{
	let caption = state('30 of 100 rows');

	<section data-control-page>
		<Caption children={caption} />
		<Note children={caption} />
		<button
			type="button"
			data-advance
			onClick={() => {
				caption = '60 of 100 rows';
			}}
		>
			Recount
		</button>
	</section>
}
