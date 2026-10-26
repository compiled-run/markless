import { state } from '@markless/core';

export default function App() @{
	let u = state({ name: 'n', p: undefined as undefined | { name: string } });
	let rows = state([{ id: 'r1', tag: undefined as undefined | { label: string } }]);
	<div>
		<output data-root>{u?.name}</output>
		<output data-nested>{u.p?.name}</output>
		<output data-fallback>{u.p?.name ?? 'none'}</output>
		<output data-bracket>{u.p?.['name']}</output>
		<output data-upper>{u.p?.name.toUpperCase()}</output>
		<output data-literal>{`[${u.p?.name ?? '-'}]`}</output>
		<output data-attr title={u.p?.name ?? 'untitled'}>attr</output>
		<ul>
			@for (const row of rows; key row.id) {
				<li data-row>{row.tag?.label ?? 'plain'}</li>
			}
		</ul>
		<button data-name onClick={() => { u.name = 'm'; }}>name</button>
		<button data-set onClick={() => { u.p = { name: 'z' }; }}>set</button>
		<button data-deep onClick={() => { if (u.p) u.p.name = 'q'; }}>deep</button>
		<button data-unset onClick={() => { u.p = undefined; }}>unset</button>
		<button data-tag onClick={() => { rows[0].tag = { label: 'hot' }; }}>tag</button>
	</div>
}
