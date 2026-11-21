import { computed, state } from '@markless/core';

export default function App() @{
	let rank = state(-1);
	const placed = computed(() => `order: ${Math.round(rank)}`);
	<main>
		<style>
			.list {
				display: flex;
				flex-direction: column;
				gap: 8px;
				margin: 0 12px;
			}
			.item {
				font-size: 16px;
				white-space: nowrap;
				padding: 6px;
				background: #edf2f4;
			}
			.moving {
				background: #ef476f;
				color: #ffffff;
			}
			.tap {
				display: block;
				margin: 12px;
				font-family: inherit;
				font-size: 18px;
				padding: 10px 18px;
				border: 2px solid #22223b;
				border-radius: 10px;
				background: #ffd166;
				color: #22223b;
			}
		</style>
		<h1>Integer slot</h1>
		<div class="list">
			<span class="item">Item one</span>
			<span class="item">Item two</span>
			<span class="item moving" style={placed}>Moving item</span>
		</div>
		<button class="tap" onClick={() => (rank = rank + 2)}>Later</button>
		<p>Rank {rank}</p>
	</main>
}
