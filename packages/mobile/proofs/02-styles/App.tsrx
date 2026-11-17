import { state } from '@markless/core';

export default function App() @{
	let count = state(0);
	<main class="screen">
		<style>
			.screen {
				padding: 24px;
				background: #f4f1ea;
			}
			.title {
				font-size: 28px;
				font-weight: 700;
				color: #1d1b16;
			}
			.tap {
				margin-top: 16px;
				padding: 12px 20px;
				border: 2px solid #1d1b16;
				border-radius: 12px;
				background: #ffd166;
				color: #1d1b16;
				font-size: 18px;
			}
		</style>
		<h1 class="title">Styled counter</h1>
		<button class="tap" onClick={() => count++}>Count {count}</button>
	</main>
}
