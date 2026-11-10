import { state } from '@markless/core';
import { ChapterView } from './chapter-view.tsrx';

export default function RekeyPage() @{
	let chapter = state(1);

	<main>
		<button data-next onClick={() => chapter++}>Next</button>
		@for (const chosen of [chapter]; key chosen) {
			<div data-holder>
				<ChapterView chapter={chosen} />
			</div>
		}
	</main>
}
