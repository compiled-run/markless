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
	<>
		<style>
			.form {
				display: grid;
				gap: 18px;
				padding: 20px;
				border: 1px solid var(--line);
				border-radius: var(--radius);
				background: var(--card);
				box-shadow: var(--shadow);
			}
			.field {
				display: grid;
				gap: 6px;
				font-weight: 600;
			}
			.field input,
			.field select,
			.field textarea {
				width: 100%;
				padding: 12px 14px;
				border: 1px solid var(--line);
				border-radius: 10px;
				background: var(--paper);
				font-weight: 400;
			}
			.field textarea {
				min-height: 180px;
				resize: vertical;
			}
			.field input:focus,
			.field select:focus,
			.field textarea:focus {
				border-color: var(--accent);
			}
			.meta {
				display: grid;
				gap: 18px;
			}
			@media (min-width: 700px) {
				.meta {
					grid-template-columns: 1fr 1fr;
					align-items: end;
				}
			}
			.check {
				display: flex;
				align-items: center;
				gap: 10px;
				min-height: 44px;
			}
			.check input {
				width: 22px;
				height: 22px;
				accent-color: var(--accent);
			}
			.actions {
				display: flex;
				justify-content: flex-end;
				gap: 10px;
			}
		</style>
		<form
			class="form"
			onSubmit={(event) => {
				event.preventDefault();
				onSave(draftFrom(event.currentTarget));
			}}
		>
			<label class="field">
				Title
				<input name="title" value={title} required maxlength="80" autocomplete="off" />
			</label>
			<label class="field">
				Note
				<textarea name="body" rows="8">{body}</textarea>
			</label>
			<div class="meta">
				<label class="field">
					Tag
					<select name="tag">
						@for (const option of TAGS; key option) {
							<option value={option} selected={option === tag}>
								{option}
							</option>
						}
					</select>
				</label>
				<label class="check">
					<input type="checkbox" name="pinned" checked={pinned} />
					Pin to the top
				</label>
			</div>
			<div class="actions">
				<Link href={cancelHref} class="button">
					Cancel
				</Link>
				<button type="submit" class="button primary">
					{submitLabel}
				</button>
			</div>
		</form>
	</>
}
