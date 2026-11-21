import { state } from '@markless/core';

export default function App() @{
	let tip = state(true);
	let menu = state(false);
	let tipClosed = state('not yet');
	let menuClosed = state('not yet');
	<main>
		<h1>Hints</h1>
		<p>Tip closed: {tipClosed}</p>
		<p>Menu closed: {menuClosed}</p>
		<button onClick={() => (tip = true)}>Show tip</button>
		<div
			overlay
			overlay-hint
			role="tooltip"
			hidden={tip !== true}
			onDismiss={(event) => {
				tipClosed = event.detail.reason;
				tip = false;
			}}
		>
			<p>Saves a draft</p>
			<button onClick={() => (menu = true)}>More</button>
		</div>
		<div
			overlay
			role="dialog"
			hidden={menu !== true}
			onDismiss={(event) => {
				menuClosed = event.detail.reason;
				menu = false;
			}}
		>
			<p>Draft options</p>
			<button onClick={() => (tip = true)}>Explain</button>
		</div>
	</main>
}
