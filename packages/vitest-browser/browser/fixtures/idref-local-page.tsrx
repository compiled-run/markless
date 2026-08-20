import { element } from '@markless/core';

// The author names the relationship and never spells an id: `el=` says which
// element the handle locates, `for=` says which element points at it.
export default function IdrefLocalPage() @{
	const trigger = element<HTMLButtonElement>();
	<div data-idref-local>
		<label data-local-label for={trigger}>Name</label>
		<button type="button" data-local-trigger el={trigger}>go</button>
	</div>
}
