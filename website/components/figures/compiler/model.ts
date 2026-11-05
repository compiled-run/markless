// The source the compiler figure starts from: a chat box's draft line.
export const START_SOURCE = `import { state } from '@markless/core';

export default function Chat() @{
	let draft = state('Hi');

	<section>
		<p>Typing: {draft}</p>
		<input onInput={(event) => (draft = event.currentTarget.value)} />
	</section>
}
`;

export const LINE_SLOTS = 12;
export const PIECE_SLOTS = 5;
