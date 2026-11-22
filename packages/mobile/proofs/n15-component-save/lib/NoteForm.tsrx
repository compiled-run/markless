import { Link } from '@markless/router';
import { draftFrom, TAGS, type NoteDraft } from './notes.ts';

export default function NoteForm({
	title,
	body,
	tag,
	pinned,
	submitLabel,
	cancelHref,
	onSave,
}: {
	readonly title: string;
	readonly body: string;
	readonly tag: string;
	readonly pinned: boolean;
	readonly submitLabel: string;
	readonly cancelHref: string;
	readonly onSave: (draft: NoteDraft) => void;
}) @{
	<form
		onSubmit={(event) => {
			event.preventDefault();
			onSave(draftFrom(event.currentTarget));
		}}
	>
		<input name="title" aria-label="Title" value={title} required maxlength="80" autocomplete="off" />
		<textarea name="body" aria-label="Note" rows="8">{body}</textarea>
		<select name="tag" aria-label="Tag">
			@for (const option of TAGS; key option) {
				<option value={option} selected={option === tag}>
					{option}
				</option>
			}
		</select>
		<label>
			<input type="checkbox" name="pinned" checked={pinned} />
			Pin it
		</label>
		<Link href={cancelHref}>Cancel</Link>
		<button type="submit">{submitLabel}</button>
	</form>
}
