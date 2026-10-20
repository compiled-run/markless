import { state } from '@markless/core';

type Label = { text: string };

export default function TwoRootsTyped() @{
	const label: Label = { text: 'top' };
	let count = state<number>(0);

	<>
		<header data-top>{label.text}</header>
		<button type="button" data-count onClick={() => count++}>{count}</button>
	</>
}
