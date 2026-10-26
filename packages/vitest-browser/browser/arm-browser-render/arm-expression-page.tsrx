import { state } from '@markless/core';

function Item({ path }: { readonly path: string }) @{
	let open = state(true);
	let hot = state(false);
	<div data-item={path}>
		<button data-open onClick={() => (open = !open)}>t</button>
		<button data-hot onClick={() => (hot = !hot)}>h</button>
		@if (open) { <><a href="/a" class={path === '/a' ? 'x' : 'y'} title={path + '!'} data-tone={hot ? 'hot' : 'cold'}>a</a></> }
	</div>
}

export default function ArmExpressionPage() @{
	<main>
		<Item path="/a" />
		<Item path="/b" />
	</main>
}
