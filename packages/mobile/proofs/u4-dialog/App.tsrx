import { element, state } from '@markless/core';

export default function App() @{
	const dialog = element<HTMLDialogElement>();
	const alert = element<HTMLDialogElement>();
	let deleted = state(0);
	<main>
		<h1>Dialog</h1>
		<button onClick={() => dialog?.showModal()}>Delete draft</button>
		<p>Deleted {deleted}</p>
		<button onClick={() => alert?.showModal()}>Sign out</button>
		<dialog el={dialog}>
			<h2>Delete this draft?</h2>
			<button
				onClick={() => {
					deleted++;
					dialog?.close();
				}}
			>Delete</button>
			<button onClick={() => dialog?.close()}>Keep</button>
		</dialog>
		<dialog el={alert} role="alertdialog">
			<h2>Sign out now?</h2>
			<button onClick={() => alert?.close()}>Stay</button>
		</dialog>
	</main>
}
