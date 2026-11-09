import { state } from '@markless/core';

export default function Row({ id }: { id: string }) @{
	let opened = state('');
	let count = state(0);
	let saved = state('');

	<div data-row={id}>
		<button class="open" onClick={() => (opened = id)}>open</button>
		<button class="bump" onClick={() => count++}>bump</button>
		<button class="save" onClick={() => (saved = `${id}:${count}`)}>save</button>
		<span class="opened">{opened}</span>
		<span class="saved">{saved}</span>
	</div>
}
