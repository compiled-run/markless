import { element, state } from '@markless/core';

export default function App() @{
	const dialog = element<HTMLDialogElement>();
	let closes = state(0);
	let log = state('Nothing yet');
	<main>
		<h1>Rename</h1>
		<button onClick={() => dialog?.showModal()}>Rename file</button>
		<p>Closed {closes} times</p>
		<p>{log}</p>
		<dialog
			el={dialog}
			onClose={() => {
				closes++;
				log = `${log}, then closed`;
			}}
		>
			<h2>New name?</h2>
			<button
				onClick={() => {
					dialog?.close();
					log = 'Saved';
				}}
			>Save</button>
			<button onClick={() => dialog?.close()}>Never mind</button>
		</dialog>
	</main>
}
