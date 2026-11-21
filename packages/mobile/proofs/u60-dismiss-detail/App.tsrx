import { element, state } from '@markless/core';

export default function App() @{
	let open = state(false);
	let last = state('nothing yet');
	const opener = element<HTMLButtonElement>();
	<main>
		<h1>Dismiss</h1>
		<button el={opener} onClick={() => (open = !open)}>Guide</button>
		<p>Last {last}</p>
		<div
			overlay
			role="dialog"
			hidden={open !== true}
			onDismiss={(event) => {
				const detail = event.detail;
				const pressed = detail.pressTarget;
				const onOpener = pressed !== undefined && opener !== undefined && opener.contains(pressed);
				last = onOpener ? `${detail.reason} on Guide` : detail.reason;
				if (!onOpener) open = false;
			}}
		>
			<p>Step one</p>
		</div>
	</main>
}
