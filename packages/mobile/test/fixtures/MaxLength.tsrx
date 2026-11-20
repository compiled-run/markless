import { state } from '@markless/core';

export default function MaxLength() @{
	let handle = state('Alexandra');
	let limit = state(5);
	let sent = state('');
	<main>
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget);
				sent = `${String(data.get('handle'))}|${String(data.get('code'))}`;
			}}
		>
			<input
				aria-label="Handle"
				name="handle"
				maxlength="5"
				value={handle}
				onInput={(event) => (handle = event.currentTarget.value)}
			/>
			<input aria-label="Code" name="code" maxlength={limit} />
			<button>Send</button>
		</form>
		<button onClick={() => (limit = 3)}>Shorter codes</button>
		<button onClick={() => (handle = 'Bartholomew')}>Rename</button>
		<p>{sent}</p>
	</main>
}
