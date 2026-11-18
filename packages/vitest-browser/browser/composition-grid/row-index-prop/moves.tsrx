import { state } from '@markless/core';
import CountedLine from './counted-line.tsrx';

export default function Moves() @{
	let items = state(['a', 'b', 'c']);
	<div>
		<button data-front onClick={() => (items = ['w', ...items])}>front</button>
		<button data-drop onClick={() => (items = items.filter((item) => item !== 'b'))}>drop</button>
		<button data-flip onClick={() => (items = [...items].reverse())}>flip</button>
		<button data-middle onClick={() => (items = [items[0], 'm', ...items.slice(1)])}>middle</button>
		@for (const item of items; index place; key item) {
			<CountedLine label={item} place={place + 1} />
		}
	</div>
}
