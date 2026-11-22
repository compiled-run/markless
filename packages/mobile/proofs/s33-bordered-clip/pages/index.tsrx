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
				margin-bottom: 16px;
				border: 6px solid #c9a227;
				border-radius: 16px;
				overflow: hidden;
				background: #fffdf7;
			}
			.uneven {
				border-width: 2px 10px;
				border-color: #3b4a8a;
			}
			.band {
				height: 72px;
				background: #2f6b4f;
			}
			.uneven .band {
				background: #b5482f;
			}
			.body {
				padding: 12px 16px;
			}
			.tap {
				display: block;
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
		<h1>Bordered cards</h1>
		<div class="card">
			<div class="band"></div>
			<p class="body">Basil, inside the border</p>
		</div>
		<div class="card uneven">
			<div class="band"></div>
			<p class="body">Thyme, uneven sides</p>
		</div>
		<button class="tap" onClick={() => opened++}>Open card</button>
		<p>{`Opened ${opened}`}</p>
	</main>
}
