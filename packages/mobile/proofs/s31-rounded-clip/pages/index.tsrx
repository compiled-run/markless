import { state } from '@markless/core';

export default function Cards() @{
	let opened = state(0);
	<main class="cards">
		<style>
			.cards {
				padding: 24px;
			}
			h1 {
				font-size: 28px;
				font-weight: 400;
			}
			.card {
				width: 240px;
				border-radius: 16px;
				overflow: hidden;
				background: #fffdf7;
			}
			.band {
				height: 96px;
				background: #2f6b4f;
			}
			.body {
				padding: 12px 16px;
			}
			.tap {
				display: block;
				margin-top: 16px;
				padding: 10px 16px;
				border: 2px solid #2f6b4f;
				border-radius: 10px;
				background: #ffffff;
				color: #2f6b4f;
				font-family: inherit;
				font-size: 17px;
			}
		</style>
		<title>Cards</title>
		<h1>Garden cards</h1>
		<div class="card">
			<div class="band"></div>
			<p class="body">Basil, rounded at the top</p>
		</div>
		<button class="tap" onClick={() => opened++}>Open card</button>
		<p>{`Opened ${opened}`}</p>
	</main>
}
