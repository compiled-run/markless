import { state } from '@markless/core';

const SPRITE = 'plants.svg';

function asset(path: string): string {
	return '/' + path.replace(/^\/+/, '');
}

export default function App() @{
	const marks = asset(SPRITE) + '#';
	let plants = state([
		{ id: 'a', name: 'Sunny', mark: 'sun' },
		{ id: 'b', name: 'Leafy', mark: 'leaf' },
		{ id: 'c', name: 'Rainy', mark: 'drop' },
	]);
	<main>
		<h1>Plants</h1>
		<button onClick={() => (plants = [...plants].reverse())}>Reverse</button>
		<button onClick={() => (plants = plants.filter((plant) => plant.id !== 'b'))}>Remove leafy</button>
		<button onClick={() => (plants = plants.map((plant) => (plant.id === 'a' ? { ...plant, mark: 'leaf' } : plant)))}>Sunny grows a leaf</button>
		<ul>
			@for (const plant of plants; key plant.id) {
				<li>
					<svg role="img" aria-label={plant.name + ' ' + plant.mark} viewBox="0 0 24 24" width="48" height="48">
						<use href={marks + plant.mark} />
					</svg>
					<span>{plant.name}</span>
				</li>
			}
		</ul>
	</main>
}
