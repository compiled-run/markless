import Code from './code-block.tsrx';

export default function Block() @{
	<Code
		files={[{ name: 'a.tsrx' }, { name: 'b.ts' }]}
		panes={[
			{ name: 'a.tsrx', tab: 'first', lines: [{ id: 'l0', text: 'alpha' }] },
			{ name: 'b.ts', tab: 'b.ts', lines: [{ id: 'l0', text: 'beta' }] },
			{ name: 'c.css', tab: 'c.css', lines: [{ id: 'l0', text: 'gamma' }] },
		]}
	/>
}
