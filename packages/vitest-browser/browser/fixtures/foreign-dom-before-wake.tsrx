import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	let other = state(0);

	<div>
		<header>
			<div data-search-slot><button type="button" data-placeholder>Search</button></div>
			<a class="github-button" href="https://github.com/">Star</a>
			<a href="/">Home</a>
		</header>
		<main>
			<p data-owned class={count > 0 ? 'on' : 'off'}>{count}</p>
			<button type="button" data-bump onClick={() => count++}>Bump</button>
			<button type="button" data-other onClick={() => other++}>Other</button>
			<output data-other-count>{other}</output>
		</main>
	</div>
}
