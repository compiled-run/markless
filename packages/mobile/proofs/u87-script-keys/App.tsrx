import { element, state } from '@markless/core';

export default function ScriptKeys() @{
	let heard = state('No key yet');
	const panel = element<HTMLDivElement>();
	<main>
		<div el={panel} tabindex={-1} onKeydown={(event) => (heard = `Script sent ${event.key}`)}>
			<p>{heard}</p>
		</div>
		<button onClick={() => panel?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))}>Send Home</button>
		<button onClick={() => panel?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))}>Send End</button>
	</main>
}
