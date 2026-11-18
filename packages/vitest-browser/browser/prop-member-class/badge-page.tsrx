import { state } from '@markless/core';
import { Badge } from './badge.tsrx';

export default function BadgePage() @{
	let label = state('Row 0');
	<main>
		<button type="button" onClick={() => (label = label === 'Row 0' ? 'Row 1' : 'Row 0')}>next</button>
		<Badge label={label} />
	</main>
}
