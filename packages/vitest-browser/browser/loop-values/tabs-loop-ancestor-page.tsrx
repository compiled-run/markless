import { state } from '@markless/core';
import { session } from './session.ts';
import { tabs } from '../../../headless/components/src/index.ts';

type Pane = { readonly name: string; readonly tab: string };

function Files({ panes }: { readonly panes: readonly Pane[] }) @{
	let seen = state(0);
	const first = panes[0]?.tab ?? '';

	<figure
		class="code-block"
		data-testid="figure"
		onPointerover={(event) => void session(event, panes)}
		onFocusin={(event) => void session(event, panes)}
	>
		<tabs.root value={first}>
			<div>
				<tabs.list aria-label="Files">
					<div role="presentation">
						@for (const pane of panes; key pane.name) {
							<tabs.trigger data-testid={`trigger-${pane.name}`} value={pane.tab}>{pane.name}</tabs.trigger>
						}
					</div>
				</tabs.list>
				<button data-testid="reset" onClick={() => { seen = 0; }}>{seen}</button>
			</div>
			@for (const pane of panes; key pane.name) {
				<tabs.content data-testid={`panel-${pane.name}`} value={pane.tab}>{pane.name} body</tabs.content>
			}
		</tabs.root>
	</figure>
}

export default function App() @{
	<Files
		panes={[
			{ name: 'one.tsrx', tab: 't1' },
			{ name: 'two.ts', tab: 't2' },
			{ name: 'three.css', tab: 't3' },
		]}
	/>
}
