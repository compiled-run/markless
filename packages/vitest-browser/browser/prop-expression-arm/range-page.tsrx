import { state } from '@markless/core';
import RangePanel from './range-panel.tsrx';

export default function RangePage() @{
	let from = state(0);
	let to = state(3);
	let route = state('a');
	<main>
		<button data-far onClick={() => (from = 2)}>far</button>
		<button data-near onClick={() => (from = 0)}>near</button>
		<button data-shrink onClick={() => (to = 1)}>shrink</button>
		<button data-rename onClick={() => (route = route + 'b')}>rename</button>
		<RangePanel route={route} from={from} to={to} />
	</main>
}
