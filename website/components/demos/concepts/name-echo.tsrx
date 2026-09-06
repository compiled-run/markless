import { state } from '@markless/core';

// The teaching file: the smallest code that works, so the page can print it and
// a reader can paste it. The site's framing classes live on the wrapper in
// `name-echo-demo.tsrx` instead, because they would do nothing in a reader's
// own project.
export default function NameEcho() @{
	let name = state('');

	<form onSubmit={(event) => event.preventDefault()}>
		<label>
			Your name
			<input value={name} onInput={(event) => (name = event.currentTarget.value)} />
		</label>
		<p>Hello, {name}</p>
		<button type="submit">Say hello</button>
	</form>
}
