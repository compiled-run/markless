import { state } from '@markless/core';
import Figure from './figure.tsrx';

export default function Board({ reload }: { reload: number }) @{
	let range = state('7d');

	<section>
		<button data-range onClick={() => (range = '30d')}>30 days</button>
		<Figure range={range} reload={reload} />
	</section>
}
