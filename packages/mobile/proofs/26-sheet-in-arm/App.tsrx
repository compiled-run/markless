import { state } from '@markless/core';
import { native, platform } from '@markless/device';

export default function App() @{
	let loaded = state(false);
	let choosing = state(false);
	let picked = state('none');
	<main>
		<h1>Product</h1>
		<p>Picked {picked}</p>
		<button onClick={() => (loaded = !loaded)}>{loaded ? 'Unload' : 'Load'}</button>
		@if (!platform.web) {
			@if (loaded) {
				<section>
					<h2>Mug</h2>
					<button onClick={() => (choosing = true)}>Choose size</button>
					<native.sheet open={choosing} onChange={(open) => (choosing = open)}>
						<h2>Sizes</h2>
						<button
							onClick={() => {
								picked = 'large';
								choosing = false;
							}}
						>
							Large
						</button>
						<button onClick={() => (loaded = false)}>Remove product</button>
					</native.sheet>
				</section>
			}
		} @else {
			<p>On the web, sizes open in a drawer</p>
		}
	</main>
}
