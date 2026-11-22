import { state } from '@markless/core';

export function Drag() @{
	let seen = state('none');
	<main>
		<div
			onPointerdown={() => {
				const onMove = (event: PointerEvent) => {
					seen = `moved to ${event.clientY}`;
				};
				const onUp = () => {
					document.removeEventListener('pointermove', onMove);
					document.removeEventListener('pointerup', onUp);
					seen = `${seen}, released`;
				};
				document.addEventListener('pointermove', onMove);
				document.addEventListener('pointerup', onUp);
			}}
		>
			Pad
		</div>
		<p>{seen}</p>
	</main>
}
