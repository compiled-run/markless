import { collapsible, tabs } from '../../index.ts';

type Pane = { readonly value: string; readonly label: string; readonly body: string };

// The docs code panel's nesting: a clamp inside a tab panel, inside a keyed
// repeat, inside a host wrapper, inside a component fed its panes by a prop.
function CodePanel({ panes }: { readonly panes: readonly Pane[] }) @{
	<tabs.root value="source" data-testid="panel-root">
		<tabs.list>
			<div role="presentation">
				@for (const pane of panes; key pane.value) {
					<tabs.trigger value={pane.value} data-testid="panel-trigger">{pane.label}</tabs.trigger>
				}
			</div>
		</tabs.list>
		<div>
			@for (const pane of panes; key pane.value) {
				<tabs.content value={pane.value} data-testid="panel-content">
					<collapsible.root data-testid="panel-clamp">
						<pre>{pane.body}</pre>
						<collapsible.trigger data-testid="panel-expand">Expand code</collapsible.trigger>
					</collapsible.root>
				</tabs.content>
			}
		</div>
	</tabs.root>
}

export default function ClampInPropPanel() @{
	<div>
		<CodePanel
			panes={[
				{ value: 'source', label: 'source.tsrx', body: 'The first file.' },
				{ value: 'styles', label: 'styles.css', body: 'The second file.' },
			]}
		/>
	</div>
}
