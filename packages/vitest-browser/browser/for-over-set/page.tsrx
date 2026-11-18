import { state } from '@markless/core';

export default function ForOverSet() @{
	let tags = state(new Set(['jazz', 'bebop']));
	let votes = state(new Map([['pizza', 2], ['tacos', 1]]));

	<section>
		<ul>
			@for (const tag of tags; key tag) {
				<li data-tag={tag}>{tag}</li>
			}
		</ul>
		<ol>
			@for (const vote of votes; key vote[0]) {
				<li data-vote={vote[0]}>{vote[0] + ':' + vote[1]}</li>
			}
		</ol>
		<button data-add onClick={() => tags.add('swing')}>add</button>
		<button data-drop onClick={() => tags.delete('jazz')}>drop</button>
		<button data-vote-pizza onClick={() => votes.set('pizza', (votes.get('pizza') ?? 0) + 1)}>vote</button>
		<button data-add-sushi onClick={() => votes.set('sushi', 1)}>sushi</button>
	</section>
}
