import { addItem } from '../mutations-refresh/server.ts';

export function CustomFieldForm() @{
	<form
		data-form
		onSubmit={async (event) => {
			event.preventDefault();
			await addItem(String(new FormData(event.currentTarget as HTMLFormElement).get('rating')));
		}}
	>
		<rating-field name="rating" data-rating></rating-field>
		<button type="submit" data-submit>Rate</button>
	</form>
}
