import { state } from '@markless/core';

export default function RowForms(props: {
	readonly name: string;
	readonly onSave: (event: SubmitEvent) => void | Promise<void>;
}) @{
	let rows = state([{ id: 'a' }, { id: 'b' }]);
	<section>
		<button type="button" data-add={props.name} onClick={() => rows.push({ id: 'c' })}>Add</button>
		<ul>
			@for (const row of rows; key row.id) {
				<li>
					<form data-form={`${props.name}-${row.id}`} onSubmit={props.onSave}>
						<button type="submit">Save</button>
					</form>
				</li>
			}
		</ul>
	</section>
}
