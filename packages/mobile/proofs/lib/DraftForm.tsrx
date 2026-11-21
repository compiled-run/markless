import { draftFrom, type Draft } from './drafts.ts';

export default function DraftForm({
	submitLabel,
	onSave,
}: {
	readonly submitLabel: string;
	readonly onSave: (draft: Draft) => void;
}) @{
	<form
		onSubmit={(event) => {
			event.preventDefault();
			onSave(draftFrom(event.currentTarget));
		}}
	>
		<input aria-label="Title" name="title" required />
		<input aria-label="Tag" name="tag" />
		<button type="submit">{submitLabel}</button>
	</form>
}
