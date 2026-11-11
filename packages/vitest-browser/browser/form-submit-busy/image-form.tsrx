import { addItem } from '../mutations-refresh/server.ts';

export function ImageForm() @{
	<form
		data-form
		onSubmit={async (event) => {
			event.preventDefault();
			await addItem((event.submitter as HTMLInputElement | null)?.name || 'none');
		}}
	>
		<input type="image" name="map" alt="Map" data-map />
		<input type="image" name="globe" alt="Globe" data-globe />
	</form>
}
