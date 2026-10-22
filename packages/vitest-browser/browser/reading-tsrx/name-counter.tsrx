import { state } from '@markless/core';

export function NameCounter({ name }: { readonly name: string }) @{
	let count = state(0);
	<button type="button" data-name={name} onClick={() => count++}>{name} {count}</button>
}
