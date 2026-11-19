import { state } from '@markless/core';

export default function TouchScript() @{
	let log = state('');
	const line = (...parts: unknown[]) => {
		let out = '';
		for (const part of parts) out += '/' + String(part);
		return out;
	};
	<main>
		<p>{log}</p>
		<div
			onPointerdown={(event) => {
				log =
					log +
					' down' +
					line(event.pointerType, event.pointerId, event.button, event.buttons, event.clientX, event.clientY, event.isPrimary, event.timeStamp);
			}}
			onPointermove={(event) => {
				log = log + ' move' + line(event.clientX, event.clientY, event.buttons);
			}}
			onPointerup={(event) => {
				log = log + ' up' + line(event.button, event.buttons, event.timeStamp);
			}}
			onPointercancel={(event) => {
				log = log + ' cancel' + line(event.clientX, event.clientY);
			}}
		>
			Pad
		</div>
	</main>
}
