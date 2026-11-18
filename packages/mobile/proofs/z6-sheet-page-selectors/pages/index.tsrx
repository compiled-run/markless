import { state } from '@markless/core';
import { native, platform } from '@markless/device';

export default function Index() @{
	let picking = state(false);
	<main class="page">
		<style>
			.page {
				padding: 24px;
				background: #fff3e6;
				color: #6a040f;
				font-size: 19px;
			}
			.panel {
				padding: 12px;
				border: 3px solid #6a040f;
				border-radius: 10px;
			}
			.open {
				display: block;
				padding: 10px 16px;
				border: 2px solid #6a040f;
				border-radius: 8px;
				background: #ffffff;
				color: inherit;
				font-family: inherit;
				font-size: inherit;
			}
			.sheet {
				padding: 20px;
			}
			.panel .pick {
				padding: 10px 14px;
				border-radius: 8px;
				background: #ffba08;
				color: #370617;
			}
		</style>
		<h1>Spices</h1>
		<section class="panel">
			<button class="open" onClick={() => (picking = true)}>Pick a spice</button>
			@if (!platform.web) {
				<native.sheet open={picking} onChange={(open) => (picking = open)}>
					<div class="sheet">
						<h2>Pick a spice</h2>
						<p class="pick">Saffron</p>
						<p>Coloured by the page</p>
					</div>
				</native.sheet>
			} @else {
				<p>On the web, the spices open in a drawer</p>
			}
		</section>
	</main>
}
