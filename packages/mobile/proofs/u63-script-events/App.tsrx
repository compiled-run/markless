import { element, state } from '@markless/core';

export default function App() @{
	let count = state(0);
	let hover = state('none');
	let open = state(true);
	let closed = state('not yet');
	const plus = element<HTMLButtonElement>();
	const box = element<HTMLDivElement>();
	const panel = element<HTMLDivElement>();
	<main>
		<h1>Raised</h1>
		<button el={plus} onClick={() => (count = count + 1)}>Plus</button>
		<p>Count {count}</p>
		<button onClick={() => plus?.click()}>Click Plus</button>
		<div el={box} onPointerover={(event) => (hover = `${event.pointerType === '' ? 'script' : event.pointerType} over`)}>
			<p>Hover {hover}</p>
		</div>
		<button
			onClick={() => {
				box?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
			}}
		>
			Hover by script
		</button>
		<div
			overlay
			el={panel}
			hidden={open !== true}
			onDismiss={(event) => {
				closed = event.detail.reason;
				open = false;
			}}
		>
			<p>Panel</p>
		</div>
		<p>Closed {closed}</p>
		<button onClick={() => panel?.dispatchEvent(new CustomEvent('dismiss', { detail: { reason: 'escape' } }))}>
			Close by script
		</button>
	</main>
}
