import { state } from '@markless/core';

export default function App() @{
	let status = state('idle');
	let ticking = state('no');
	let ticks = state(0);
	<main>
		<h1>Network</h1>
		<p>Status: {status}</p>
		<p>Ticking: {ticking}</p>
		<p>Ticks: {ticks}</p>
		<button
			onClick={async () => {
				status = 'loading';
				const response = await fetch('http://127.0.0.1:28761/j4/echo?word=native', {
					method: 'POST',
					headers: { 'content-type': 'text/plain' },
					body: 'hello',
				});
				const text = await response.text();
				status = `${response.status} ${text}`;
			}}
		>
			Fetch
		</button>
		<button
			onClick={() => {
				ticking = 'yes';
				const id = setInterval(() => {
					ticks++;
					if (ticks >= 3) {
						clearInterval(id);
						ticking = 'done';
					}
				}, 1500);
			}}
		>
			Tick
		</button>
	</main>
}
