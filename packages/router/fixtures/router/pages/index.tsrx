import { state } from 'arcade';
import { Link } from 'arcade/router';

export default function Home() @{
	let count = state(0);
	let input = state('off');
	let boosts = state(0);

	<main>
		<h1>Arcade Router</h1>
		<button data-home-counter onClick={() => count++}>Button {count}</button>
		<label>
			<button
				data-home-input
				onClick={() => input = 'on'}
			>Home Input</button>
			<span data-home-input-state>Home Input {input}</span>
		</label>
		<button data-home-boost onClick={() => boosts++}>Home Boost {boosts}</button>
		<Link href="/docs/[...slug]" params={{ slug: ['getting-started'] }}>
			Docs
		</Link>
	</main>
}
