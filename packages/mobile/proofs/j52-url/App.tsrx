import { computed, state } from '@markless/core';

export default function App() @{
	let query = state('q=shoes&page=1');
	let opened = state('nothing yet');
	const page = computed(() => new URLSearchParams(query).get('page'));
	<main>
		<h1>Shop links</h1>
		<p>Query: {query}</p>
		<p>Page {page}</p>
		<p>Opened: {opened}</p>
		<button
			onClick={() => {
				const params = new URLSearchParams(query);
				params.set('page', String(Number(params.get('page')) + 1));
				query = params.toString();
			}}
		>
			Next page
		</button>
		<button
			onClick={() => {
				const params = new URLSearchParams(query);
				params.set('q', 'hats & caps');
				query = params.toString();
			}}
		>
			Search hats
		</button>
		<button
			onClick={() => {
				const url = new URL('../orders/7?tab=items#top', 'https://shop.example/account/settings/');
				url.searchParams.append('from', 'ä');
				opened = `${url.host}${url.pathname}${url.search}`;
			}}
		>
			Open order
		</button>
	</main>
}
