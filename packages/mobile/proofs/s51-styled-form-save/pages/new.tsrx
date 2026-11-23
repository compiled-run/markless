import { state, storage } from '@markless/core';
import { navigate } from '@markless/router';
import { addNote } from '../lib/notes.ts';

export default function NewNote() @{
	let saved = storage('s51-notes', '[]');
	let title = state('');
	<main class="page">
		<style>
			.page {
				padding: 24px;
				background: #fbf8f1;
				color: #1f1d1a;
			}
			.form {
				display: grid;
				gap: 16px;
				padding: 20px;
				border: 1px solid #e4ddcf;
				border-radius: 14px;
				background: #ffffff;
			}
			.field {
				display: grid;
				gap: 6px;
				font-weight: 600;
			}
			.field input {
				width: 100%;
				padding: 12px 14px;
				border: 1px solid #e4ddcf;
				background: #fbf8f1;
				font: inherit;
				font-family: Ahem;
				font-weight: 400;
			}
			.save {
				display: block;
				padding: 12px 16px;
				border: 0;
				border-radius: 12px;
				background: #2f6f5e;
				color: #ffffff;
				font: inherit;
			}
		</style>
		<form
			class="form"
			onSubmit={async (event) => {
				event.preventDefault();
				saved = addNote(saved, title);
				await new Promise((done) => setTimeout(done));
				await navigate('/');
			}}
		>
			<label class="field">
				Title
				<input
					name="title"
					autocomplete="off"
					value={title}
					onInput={(event) => (title = event.currentTarget.value)}
				/>
			</label>
			<button type="submit" class="save">
				Save note
			</button>
		</form>
	</main>
}
