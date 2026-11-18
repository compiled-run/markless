import { addItem } from '../mutations-refresh/server.ts';

export function ClearingForm() @{
	<form
		data-form
		onSubmit={async (event) => {
			event.preventDefault();
			const field = (event.currentTarget as HTMLFormElement).elements.namedItem('name') as HTMLInputElement;
			const name = field.value;
			field.value = '';
			await addItem(name);
		}}
	>
		<input data-field name="name" value="Grace" />
		<button type="submit" data-submit>Send</button>
	</form>
}
