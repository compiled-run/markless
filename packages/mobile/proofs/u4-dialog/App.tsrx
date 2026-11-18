import { element, state } from '@markless/core';

export default function App() @{
	const dialog = element<HTMLDialogElement>();
	let deleted = state(0);
	<main>
		<h1>Dialog</h1>
		<button onClick={() => dialog?.showModal()}>Delete draft</button>
		<p>Deleted {deleted}</p>
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
	</main>
}
