import { computed, state } from '@markless/core';

function surfaceStyle(point: { x: number; y: number } | null): string {
	if (point === null) return '';
	return `--x: ${point.x}px; --y: ${point.y}px;`;
}

export default function StyleCases() @{
	let point = state<{ x: number; y: number } | null>(null);
	const placement = computed(() => surfaceStyle(point));
	<main>
		<div style={placement}>Surface</div>
		<button onClick={() => (point = { x: 40, y: 200.5 })}>Open</button>
		<button onClick={() => (point = { x: 12, y: 200.5 })}>Move</button>
		<button onClick={() => (point = null)}>Close</button>
	</main>
}
