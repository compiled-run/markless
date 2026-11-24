import { computed, state } from '@markless/core';

const later = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function settle(label: string, n: number): Promise<{ n: number; text: string }> {
	await later(4000);
	if (n < 0) throw new Error(`No ${label} for ${n}`);
	return { n: n + 1, text: `${label}${n}` };
}

export default function App() @{
	let version = state(1);
	const first = computed(async () => settle('A', version));
	const second = computed(async () => settle('B', first.n));
	<main>
		<h1>Chain</h1>
		<p>Asked: {version}</p>
		<button onClick={() => (version = version + 1)}>Bump</button>
		<button onClick={() => (version = -1)}>Break</button>
		@try {
			<p>Second: {second.text}</p>
		} @pending {
			<p>Waiting for second</p>
		} @catch (error) {
			<p>Second failed: {error.message}</p>
		}
	</main>
}
