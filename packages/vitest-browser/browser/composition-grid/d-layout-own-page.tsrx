import { state } from '@markless/core';
import LayoutFrame from './layout-frame.tsrx';
import StatsCard from './stats-card.tsrx';

export default function LayoutOwnPage() @{
	let subject = state('a');
	let round = state(0);

	<div>
		<button type="button" data-grid-reload onClick={() => round++}>Reload</button>
		<button type="button" data-grid-subject onClick={() => (subject = subject === 'a' ? 'b' : 'a')}>Other</button>
		<LayoutFrame>
			<StatsCard subject={subject} round={round} />
		</LayoutFrame>
	</div>
}
