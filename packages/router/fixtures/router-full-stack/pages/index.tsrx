import { state } from 'arcade';

export default function Home() @{
	let count = state(0);

	<main>
		<h1>Arcade Full Stack</h1>
		<button onClick={() => count++}>Count {count}</button>
	</main>
}
