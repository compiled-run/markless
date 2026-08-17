import { state } from '@markless/core';
import { Counter } from "../components/counter/counter.tsrx"

export default function Home() @{
	let count = state(0);

	<main>
		<div>
			<h1>
				<span>Your code</span>,
				<span>compiled to whatever comes next.</span>
			</h1>
		</div>

		<p class="subtitle">An open source organization building compiler software. Frameworks change. Platforms multiply. The tools stay useful.</p>

		<style>
			.subtitle {
				font-size: var(--step-1);
			}
		</style>
	</main>
}
