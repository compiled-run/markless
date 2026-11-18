import { state } from '@markless/core';
import { TallyRow } from './tally-row.tsrx';

export default function TallyPage() @{
	let chapter = state(1);

	<main>
		<p data-chapter>{chapter}</p>
		<button data-page-next onClick={() => chapter++}>next here</button>
		@for (const value of [chapter]; key value) {
			<TallyRow chapter={value} onNext={() => (chapter = value + 1)} />
		}
	</main>
}
