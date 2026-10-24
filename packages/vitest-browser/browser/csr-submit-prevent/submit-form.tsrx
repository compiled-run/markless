import { state } from '@markless/core';

export default function SubmitForm() @{
	let sent = state('none');
	let count = state(0);
	let rows = state([{ id: 'a' }, { id: 'b' }]);

	<section>
		<form data-plain onSubmit={(event) => { event.preventDefault(); sent = 'plain'; }}>
			<button type="submit">Send</button>
		</form>
		<form data-after-write onSubmit={(event) => { count++; event.preventDefault(); sent = `write ${count}`; }}>
			<button type="submit">Send</button>
		</form>
		<form data-native onSubmit={() => (sent = 'native')}>
			<button type="submit">Send</button>
		</form>
		<ul>
			@for (const row of rows; key row.id) {
				<li>
					<form data-row={row.id} onSubmit={(event) => { event.preventDefault(); sent = `row ${row.id}`; }}>
						<button type="submit">Delete</button>
					</form>
				</li>
			}
		</ul>
		<output data-sent>{sent}</output>
	</section>
}
