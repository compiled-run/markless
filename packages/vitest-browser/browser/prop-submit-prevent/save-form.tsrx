export default function SaveForm(props: {
	readonly name: string;
	readonly onSave: (event: SubmitEvent) => void | Promise<void>;
}) @{
	<form data-form={props.name} onSubmit={props.onSave}>
		<input name="title" />
		<button type="submit">Save</button>
	</form>
}
