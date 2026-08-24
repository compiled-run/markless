import { state } from '@markless/core';

// A controlled field whose three gesture events each own a handler. Native
// order is keydown, input, keyup per keystroke; the trail records the order the
// bodies actually ran in, and `text` only lands empty when the appending
// keydown runs before the deleting one.
export function App() @{
	let text = state('');
	let trail = state('');

	<main data-resume-dispatch-order>
		<input
			data-field
			value={text}
			onKeyDown={(event) => {
				text = event.key === 'Backspace' ? text.slice(0, -1) : text + event.key;
				trail = `${trail}down:${event.key} `;
			}}
			onInput={() => {
				trail = `${trail}in:${text} `;
			}}
			onKeyUp={(event) => {
				trail = `${trail}up:${event.key} `;
			}}
		/>
		<output data-trail>{trail}</output>
	</main>
}
