import { state } from '@markless/core';

export default function ShellRowsPage() @{
	let submitted = state('none');
	let rows = state([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
	<main>
		<output data-submitted>{submitted}</output>
		<form data-row="plain" onSubmit={(event) => { event.preventDefault(); submitted = 'plain'; }}><button type="submit">Plain</button></form>
		<ul>
			@for (const row of rows; key row.id) {
				<li>
					<form
						data-row={row.id}
						onSubmit={(event) => {
							event.preventDefault();
							submitted = (event.target as HTMLFormElement).dataset.row ?? '';
						}}
					>
						<button type="submit">Go</button>
					</form>
				</li>
			}
		</ul>
	</main>
}
