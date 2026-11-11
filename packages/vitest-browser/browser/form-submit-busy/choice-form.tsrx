import { addItem } from '../mutations-refresh/server.ts';

export function ChoiceForm() @{
	<form
		data-form
		onSubmit={async (event) => {
			event.preventDefault();
			const choice = (event.submitter as HTMLButtonElement | null)?.value ?? 'none';
			const title = new FormData(event.currentTarget as HTMLFormElement).get('title');
			await addItem(`${choice}:${String(title)}`);
		}}
	>
		<input data-title name="title" value="Mug" />
		<button type="submit" value="keep" data-keep>Keep</button>
		<button type="submit" value="archive" data-archive>Archive</button>
		<button type="button" data-other>Preview</button>
	</form>
}
