import { state } from '@markless/core';

export default function FormArms() @{
	let gift = state(false);
	let sent = state('none');

	<form
		onSubmit={(event) => {
			event.preventDefault();
			const data = new FormData(event.currentTarget);
			sent = `${String(data.get('name'))}|${String(data.get('note'))}|${String(data.get('wrap'))}`;
		}}
	>
		<input name="name" />
		<button>Send</button>
		@if (gift) {
			<>
				<input name="note" />
				<input type="checkbox" name="wrap" />
				<button>Send gift</button>
			</>
		}
		<button type="button" onClick={() => (gift = !gift)}>Gift</button>
		<p>{sent}</p>
	</form>
}
