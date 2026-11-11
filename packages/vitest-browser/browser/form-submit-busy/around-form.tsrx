import { addItem } from '../mutations-refresh/server.ts';

export function AroundForm() @{
	<div
		data-around
		onSubmit={async (event) => {
			event.preventDefault();
			await addItem('around');
		}}
	>
		<form data-form>
			<button type="submit" data-submit>Send</button>
		</form>
	</div>
}
