import { computed } from '@markless/core';
import AsyncItem from '../components/async-item.tsrx';
import ItemCard from '../components/item-card.tsrx';
import { slow } from '../lib/slow.ts';

export default function AsyncInChildren() @{
	const head = computed(async () => slow({ text: 'head' }, 40));
	<main>
		@try {
			<h1>{head.text}</h1>
		} @pending {
			<h1>loading head</h1>
		} @catch {
			<h1>failed</h1>
		}
		<AsyncItem id={1} />
		<AsyncItem id={2} />
		<ItemCard id={3} />
	</main>
}
