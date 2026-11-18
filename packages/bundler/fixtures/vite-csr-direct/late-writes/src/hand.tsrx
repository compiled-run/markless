import { state } from '@markless/core';

export function Hand() @{
	let hand = state(['A', 'B', 'C']);

	<section>
		<ul>
			@for (const card of hand; key card) {
				<li>{card}</li>
			}
		</ul>
		<button data-write="sync" onClick={() => hand.push('D')}>Now</button>
		<button data-write="timeout" onClick={() => setTimeout(() => hand.push('D'))}>Timer</button>
		<button
			data-write="await"
			onClick={async () => {
				await Promise.resolve();
				hand.push('D');
			}}
		>Await</button>
		<button data-write="transition" onClick={() => document.startViewTransition(() => hand.push('D'))}>Transition</button>
		<button
			data-write="then"
			onClick={() => {
				Promise.resolve().then(() => hand.push('D'));
			}}
		>Then</button>
		<button
			data-write="swap"
			onClick={() =>
				setTimeout(() => {
					const first = hand[0];
					hand[0] = hand[2];
					hand[2] = first;
				})}
		>Swap</button>
	</section>
}
