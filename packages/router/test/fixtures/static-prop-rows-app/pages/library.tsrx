import { state } from '@markless/core';
import Aisle, { Shelf } from '../components/shelf.tsrx';

const stock = [
	{ isbn: 'b-1', title: 'First fixed title', blurb: 'fixed-blurb-one' },
	{ isbn: 'b-2', title: 'Second fixed title', blurb: 'fixed-blurb-two' },
];

export default function Library() @{
	let arrivals = state([{ isbn: 'n-1', title: 'New title', blurb: 'live-blurb-one' }]);
	<main data-page="library">
		<Aisle books={stock} />
		<Shelf books={arrivals} />
		<button
			data-arrive
			onClick={() => (arrivals = [...arrivals, { isbn: `n-${arrivals.length + 1}`, title: 'Later title', blurb: 'live-blurb-more' }])}
		>
			arrive
		</button>
	</main>;
}
