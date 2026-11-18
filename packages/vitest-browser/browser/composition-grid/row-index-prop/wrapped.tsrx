import { state } from '@markless/core';
import PlaceLine from './place-line.tsrx';

export default function Wrapped() @{
	let items = state(['x', 'y']);
	<ul>
		<button data-front onClick={() => (items = ['w', ...items])}>front</button>
		@for (const item of items; index place; key item) {
			<li data-at={place}><PlaceLine label={item} place={place} /></li>
		}
	</ul>
}
