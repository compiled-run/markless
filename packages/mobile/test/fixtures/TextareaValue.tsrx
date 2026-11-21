import { state } from '@markless/core';

export function TextareaValue() @{
	let body = state('First draft');
	<main>
		<textarea aria-label="Body">{body}</textarea>
		<textarea aria-label="Fixed">{'\nKept as written'}</textarea>
		<button onClick={() => (body = 'Second draft')}>Revise</button>
	</main>
}
