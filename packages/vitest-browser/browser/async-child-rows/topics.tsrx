import { state } from '@markless/core';
import { Feed } from './feed.tsrx';

export default function Topics() @{
	let subject = state('cats');

	<section>
		<button data-dogs onClick={() => (subject = 'dogs')}>Dogs</button>
		@for (const topic of [subject]; key topic) {
			<article data-topic={topic}>
				<Feed topic={topic} />
			</article>
		}
	</section>
}
