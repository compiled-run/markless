import { state } from '@markless/core';
import Derived from './derived.tsrx';
import Direct from './direct.tsrx';
import Cards from './cards.tsrx';

export default function OpenTabs({ items, first }: { items: Array<{ id: string; text: string }>; first: string }) @{
	let tab = state(first);

	<div>
		<button data-open-derived onClick={() => (tab = 'derived')}>derived</button>
		<button data-open-direct onClick={() => (tab = 'direct')}>direct</button>
		<button data-open-cards onClick={() => (tab = 'cards')}>cards</button>
		<button data-close onClick={() => (tab = 'none')}>close</button>
		@if (tab === 'derived') {
			<Derived items={items} />
		} @else if (tab === 'direct') {
			<Direct items={items} />
		} @else if (tab === 'cards') {
			<Cards items={items} />
		} @else {
			<p>closed</p>
		}
	</div>
}
