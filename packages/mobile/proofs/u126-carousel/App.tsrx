import { state } from '@markless/core';
import { carousel } from '@markless/ui';

export default function App() @{
	let showing = state('paris');
	<main>
		<h1>Cities</h1>
		<carousel.root value="paris" onChange={(value) => (showing = String(value))}>
			<carousel.scrollarea>
				<carousel.item value="paris">Paris</carousel.item>
				<carousel.item value="oslo">Oslo</carousel.item>
			</carousel.scrollarea>
			<carousel.forwardtrigger>Next</carousel.forwardtrigger>
		</carousel.root>
		<p>{`Showing ${showing}`}</p>
	</main>
}
