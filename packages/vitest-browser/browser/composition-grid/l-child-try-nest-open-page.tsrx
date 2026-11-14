import { state } from '@markless/core';
import { TryNestCard } from './try-nest-card.tsrx';

export default function ChildTryNestOpenPage() @{
	let subject = state('a');
	let round = state(0);

	<div>
		<button type="button" data-grid-reload onClick={() => round++}>Reload</button>
		<button type="button" data-grid-subject onClick={() => (subject = subject === 'a' ? 'b' : 'a')}>Other</button>
		<TryNestCard topic={subject} version={round} start="count" />
	</div>
}
