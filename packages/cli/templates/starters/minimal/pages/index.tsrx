import { state } from 'arcade';

export default function Home() @{
	const count = state(0);

	<main>
		<h1>Arcade Router</h1>
		<button onClick={() => count++}>Count {count}</button>
	</main>
}
