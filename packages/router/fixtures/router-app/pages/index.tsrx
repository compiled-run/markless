import { state } from 'arcade';
import { Link } from 'arcade/router';

export default function Home() @{
	let count = state(0);

	<main>
		<h1>Arcade Router App</h1>
		<button onClick={() => count++}>Count {count}</button>
		<Link href="/">Home</Link>
	</main>
}
