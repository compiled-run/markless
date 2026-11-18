import { failSave, saveRow, type Board } from './grid-server.ts';

export default function NoteForms({ board }: { board: Board }) @{
	<section>
		<h2 data-g="title" class={board.parity}>{board.title}</h2>
		<ul>
			@for (const row of board.items; key row.id) {
				<li data-g="row">{row.label}</li>
			}
		</ul>
		<form
			onSubmit={async (event) => {
				event.preventDefault();
				await saveRow(board.subject);
			}}
		>
			<button type="submit" data-grid-save>Save</button>
		</form>
		<form
			onSubmit={async (event) => {
				event.preventDefault();
				await failSave(board.subject);
			}}
		>
			<button type="submit" data-grid-fail>Fail</button>
		</form>
	</section>
}
