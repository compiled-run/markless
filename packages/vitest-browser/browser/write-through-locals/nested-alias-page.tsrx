import { state } from '@markless/core';

export function NestedAliasPage() @{
	let user = state({ profile: { name: 'a', tags: ['x'] }, age: 1 });
	let order = state({ lines: [{ sku: 's1', qty: 1 }] });

	<div>
		<output data-name>{user.profile.name}</output>
		<output data-tags>{user.profile.tags.join(',')}</output>
		<output data-qty>{order.lines[0].qty}</output>
		<button data-rename onClick={() => { const p = user.profile; p.name = 'n'; }}>rename</button>
		<button data-tag onClick={() => { const p = user.profile; p.tags.push('y'); }}>tag</button>
		<button data-qty-bump onClick={() => { const line = order.lines[0]; line.qty += 2; }}>qty</button>
		<button data-chain onClick={() => { const p = user.profile; const t = p.tags; t.push('z'); }}>chain</button>
		<button data-detached onClick={() => { const p = user.profile; user.profile = { name: 'fresh', tags: [] }; p.name = 'old'; }}>detach</button>
	</div>
}
