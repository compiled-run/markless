import { save } from './api.ts';

export default function ChildForm({ person }: { readonly person: { readonly first: string } }) @{
	<form
		onSubmit={async (event) => {
			event.preventDefault();
			await save();
		}}
	>
		<input name="first" value={person.first} />
		<button type="submit" data-submit>Save</button>
	</form>
}
