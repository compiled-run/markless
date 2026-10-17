import { state } from '@markless/core';

export function App() @{
	let open = state(false);

	<div>
		<button type="button" data-toggle onClick={() => (open = !open)}>Toggle</button>
		<div data-contents style={open ? undefined : 'display: none;'}>Contents</div>
		<p data-titled title={open ? undefined : 'closed'}>Title</p>
	</div>
}
