import { state } from '@markless/core';

export default function App() @{
	let gift = state(false);
	let name = state('');
	let note = state('');
	let wrap = state(false);
	let sent = state('Nothing sent');
	<main>
		<h1>Order</h1>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				sent = `Sent ${String(data.get('name'))}, note ${String(data.get('note'))}, wrap ${String(data.get('wrap'))}`;
			}}
		>
			<input aria-label="Name" name="name" onInput={(event) => (name = event.currentTarget.value)} />
			<button>Send</button>
			@if (gift) {
				<>
					<input aria-label="Note" name="note" onInput={(event) => (note = event.currentTarget.value)} />
					<input
						type="checkbox"
						aria-label="Wrap it"
						name="wrap"
						onChange={(event) => (wrap = event.currentTarget.checked)}
					/>
					<button>Send gift</button>
				</>
			}
			<button type="button" onClick={() => (gift = !gift)}>{gift ? 'No gift' : 'Make it a gift'}</button>
		</form>
		<p>Typed {name === '' ? 'nothing' : name}</p>
		<p>Noted {note === '' ? 'nothing' : note}</p>
		<p>{wrap ? 'Wrapped' : 'Not wrapped'}</p>
		<p>{sent}</p>
	</main>
}
