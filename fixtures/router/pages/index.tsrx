import { state } from 'arcade';
import { Link } from 'arcade/router';

export default function Home() @{
	const count = state(0);

	<main>
		<h1>Arcade Router</h1>
		<button onClick={() => count++}>Button {count}</button>
		<Link href="/docs/[...slug]" params={{ slug: ['getting-started'] }}>
			Docs
		</Link>
	</main>
}
