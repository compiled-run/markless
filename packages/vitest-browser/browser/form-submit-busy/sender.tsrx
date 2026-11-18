export function Sender(props: { onSave: () => Promise<void> }) @{
	<form
		data-form
		onSubmit={(event) => {
			event.preventDefault();
			return props.onSave();
		}}
	>
		<button type="submit" data-submit>Send</button>
	</form>
}
