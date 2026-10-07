import { state } from '@markless/core';
import { tabs } from '../../../headless/components/src/index.ts';

function Files({ files }: { readonly files: readonly { readonly name: string }[] }) @{
	let clicks = state(0);

	<div>
		<button data-testid="own" onClick={() => { clicks += 1; }}>{clicks}</button>
		<tabs.root value={files[0].name}>
			<tabs.list aria-label="Files">
				@for (const f of files; key f.name) {
					<tabs.trigger data-testid={`trigger-${f.name}`} value={f.name}>{f.name}</tabs.trigger>
				}
			</tabs.list>
			@for (const f of files; key f.name) {
				<tabs.content data-testid={`panel-${f.name}`} value={f.name}>{f.name} body</tabs.content>
			}
		</tabs.root>
	</div>
}

export default function App() @{
	<Files files={[{ name: 'one.tsrx' }, { name: 'two.ts' }, { name: 'three.css' }]} />
}
