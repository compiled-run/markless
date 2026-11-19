import { state } from '@markless/core';

export function Counter() @{
	let count = state(0);

	<main class="screen">
		<style>
			.screen { display: flex; flex-direction: column; align-items: center; padding: 48px 24px; background-color: #f8fafc; }
			.title { margin: 0 0 24px 0; font-size: 24px; color: #0f172a; }
			.tap { appearance: none; background-color: #2563eb; color: #ffffff; border: 2px solid #1e3a8a; border-radius: 12px; padding: 12px 20px; font-family: inherit; font-size: 20px; }
		</style>
		<h1 class="title">Counter</h1>
		<button class="tap" onClick={() => count++}>Count {count}</button>
	</main>
}
