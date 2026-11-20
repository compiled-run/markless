import { element, state } from '@markless/core';

function landCaret(box: HTMLInputElement | undefined, words: string): void {
	if (box === undefined) return;
	box.value = words;
	box.focus();
	box.select();
}

export default function Rename() @{
	const field = element<HTMLInputElement>();
	let editing = state(false);
	let name = state('Draft');
	<main>
		<button
			onClick={() => {
				editing = true;
				landCaret(field, name);
			}}
		>
			Rename
		</button>
		<input
			el={field}
			aria-label="Name"
			hidden={!editing}
			onKeyDown={(event) => {
				if (event.key === 'Enter') {
					name = (event.target as HTMLInputElement).value;
					editing = false;
				}
			}}
		/>
		<p>{`Name ${name}`}</p>
	</main>
}
