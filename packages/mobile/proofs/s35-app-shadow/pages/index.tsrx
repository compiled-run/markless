import { state } from '@markless/core';

export default function Cards() @{
	let lifted = state(false);
	<main class="page">
		<style>
			.page {
				padding: 24px;
				background: #fbf8f1;
			}
			.card {
				display: block;
				margin-top: 16px;
				padding: 16px 18px;
				border: 1px solid #e4ddcf;
				border-radius: 14px;
				background: #ffffff;
				box-shadow: 0 1px 2px rgb(0 0 0 / 0.06), 0 4px 14px rgb(0 0 0 / 0.05);
				font-size: 17px;
				color: #2b2620;
			}
			.card.lifted {
				box-shadow: 0 6px 6px rgba(0, 0, 0, 0.45);
			}
			.toggle {
				display: block;
				margin-top: 24px;
				padding: 10px 16px;
				border: 2px solid #264653;
				border-radius: 10px;
				background: #ffffff;
				color: #264653;
				font-family: inherit;
				font-size: 17px;
			}
		</style>
		<title>Shadow cards</title>
		<div class="card">Groceries</div>
		<div class={lifted ? 'card lifted' : 'card'}>Plumber</div>
		<button class="toggle" onClick={() => (lifted = !lifted)}>
			Lift the second card
		</button>
		@if (lifted) {
			<p>Lifted</p>
		} @else {
			<p>Resting</p>
		}
	</main>
}
