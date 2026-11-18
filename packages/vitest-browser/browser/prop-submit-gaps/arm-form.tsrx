import { state } from '@markless/core';

export default function ArmForm(props: {
	readonly name: string;
	readonly onSave: (event: SubmitEvent) => void | Promise<void>;
}) @{
	let open = state(true);
	<section>
		<button type="button" data-toggle={props.name} onClick={() => (open = !open)}>Toggle</button>
		@if (open) {
			<form data-form={props.name} onSubmit={props.onSave}>
				<button type="submit">Save</button>
			</form>
		}
	</section>
}
