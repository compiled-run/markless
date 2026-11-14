import { state } from '@markless/core';
import { TryIfCard } from './try-if-card.tsrx';

export default function ChildTryIfOpenPage() @{
	let subject = state('a');
	let round = state(0);

	<div>
		<button type="button" data-grid-reload onClick={() => round++}>Reload</button>
		<button type="button" data-grid-subject onClick={() => (subject = subject === 'a' ? 'b' : 'a')}>Other</button>
		<TryIfCard topic={subject} version={round} start="count" />
	</div>
}
