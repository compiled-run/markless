import { state } from '@markless/core';
import { platform, sharesheet } from '@markless/device';

function Sharer() @{
	let closed = state(0);
	<section>
		<button
			onClick={async () => {
				await sharesheet.open({ title: 'Markless proof', url: 'https://markless.dev/' });
				closed++;
			}}
		>
			Share link
		</button>
		<p>Closed {closed}</p>
	</section>
}

export default function App() @{
	<main>
		<h1>Share</h1>
		@if (!platform.web) {
			<Sharer />
		} @else {
			<p>Sharing is not available here</p>
		}
	</main>
}
