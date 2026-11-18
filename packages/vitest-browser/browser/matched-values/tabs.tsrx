import { computed, state } from '@markless/core';
import { answer } from './gates.ts';

export function Tabs() @{
	let tab = state('uno');
	let qty = state(1);
	const page = computed(async () => answer(`page:${tab}`, `Page ${tab}`));
	const quote = computed(async () => answer(`quote:${qty}`, qty * 5));
	const title = computed(() => tab.toUpperCase());

	<main>
		<button type="button" data-uno class={tab === 'uno' ? 'selected' : ''} onClick={() => (tab = 'uno')}>Uno</button>
		<button type="button" data-dos class={tab === 'dos' ? 'selected' : ''} onClick={() => (tab = 'dos')}>Dos</button>
		<button type="button" data-plus onClick={() => (qty = qty + 1)}>{qty}</button>
		<h1 data-title>{title}</h1>
		@try {
			<p data-page>{page}</p>
		} @pending {
			<p>Loading page</p>
		}
		@try {
			<p data-quote>{quote}</p>
		} @pending {
			<p>Quoting</p>
		}
	</main>
}
