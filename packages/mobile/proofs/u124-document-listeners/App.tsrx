import { state } from '@markless/core';

export default function App() @{
	let seen = state('Idle');
	let moves = state(0);
	<main>
		<style>
			.pad {
				padding: 24px;
				touch-action: none;
			}
		</style>
		<h1>Document listeners</h1>
		<div
			class="pad"
			onPointerdown={() => {
				const onMove = () => {
					moves = moves + 1;
					seen = 'Moving';
				};
				const onUp = () => {
					document.removeEventListener('pointermove', onMove);
					document.removeEventListener('pointerup', onUp);
					seen = moves > 0 ? 'Released after moving' : 'Released without moving';
				};
				document.addEventListener('pointermove', onMove);
				document.addEventListener('pointerup', onUp);
			}}
		>
			Drag here
		</div>
		<p>{seen}</p>
	</main>
}
