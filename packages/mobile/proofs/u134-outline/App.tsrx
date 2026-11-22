import { state } from '@markless/core';

export default function App() @{
	let wide = state(false);
	<main>
		<style>
			main {
				padding: 4px 0 12px;
				background: #f4f1ea;
			}
			.card {
				margin: 16px 24px;
				padding: 12px 16px;
				font-size: 17px;
				background: #ffffff;
				color: #22223b;
			}
			.ring {
				border: 2px solid #1d3557;
				border-radius: 14px;
				outline: 3px solid #e63946;
				outline-offset: 4px;
			}
			.double {
				outline: 7px double #2a9d8f;
			}
			.dashed {
				outline: 3px dashed #6a4c93;
				outline-offset: -1px;
			}
			.groove {
				outline: 6px groove #8d99ae;
			}
			.row {
				display: flex;
				margin: 16px 24px;
			}
			.cell {
				flex: 1;
				padding: 12px 8px;
				font-size: 16px;
				background: #a8dadc;
				color: #22223b;
			}
			.marked {
				outline: 4px solid #f4a261;
			}
			.tap {
				display: block;
				margin: 12px 24px;
				font-family: inherit;
				font-size: 18px;
				padding: 10px 18px;
				border: 2px solid #22223b;
				border-radius: 10px;
				background: #ffd166;
				color: #22223b;
			}
			.thick {
				outline-width: 6px;
				outline-offset: 8px;
			}
		</style>
		<h1>Outline</h1>
		<div class={wide ? 'card ring thick' : 'card ring'}>Rounded ring</div>
		<div class="card double">Double ring</div>
		<div class="card dashed">Dashed ring</div>
		<div class="card groove">Groove ring</div>
		<div class="row">
			<div class="cell">Left</div>
			<div class="cell marked">Marked</div>
			<div class="cell">Right</div>
		</div>
		<button class="tap" onClick={() => (wide = !wide)}>Widen</button>
		<p>{wide ? 'Wide' : 'Narrow'}</p>
	</main>
}
