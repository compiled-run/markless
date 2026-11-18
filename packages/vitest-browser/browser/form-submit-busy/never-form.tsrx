type Never = { started: number; gate: Promise<void> };

export function NeverForm() @{
	<form
		data-form
		onSubmit={async (event) => {
			event.preventDefault();
			const never = (globalThis as { __never?: Never }).__never!;
			never.started++;
			await never.gate;
		}}
	>
		<input data-field name="name" value="Grace" />
		<button type="submit" data-submit>Send</button>
	</form>
}
