import { computed } from '@markless/core';
import { collapsible, tabs } from '../../index.ts';

// The docs code panel's shape: a tab per file, every trigger and every panel
// minted from a repeat inside a host wrapper, and a clamp nested in each panel.
export default function CodePanel() @{
	const panes = computed(() => [
		{
			value: 'source',
			label: 'source.tsrx',
			lines: [
				{ id: 's1', text: 'export default function Demo() {' },
				{ id: 's2', text: '\treturn null;' },
			],
		},
		{
			value: 'styles',
			label: 'styles.css',
			lines: [
				{ id: 'c1', text: '.demo {' },
				{ id: 'c2', text: '\tcolor: red;' },
			],
		},
	]);

	<div data-testid="panel-wrap">
		<tabs.root value="source" data-testid="panel-root">
			<tabs.list data-testid="panel-list">
				@for (const pane of panes; key pane.value) {
					<tabs.trigger value={pane.value} data-testid="panel-trigger">
						{pane.label}
					</tabs.trigger>
				}
			</tabs.list>
			<div data-testid="panel-panes">
				@for (const pane of panes; key pane.value) {
					<tabs.content value={pane.value} data-testid="panel-content">
						<collapsible.root data-testid="panel-clamp">
							<pre>
								@for (const line of pane.lines; key line.id) {
									<span data-testid="panel-line">{line.text}</span>
								}
							</pre>
							<collapsible.trigger data-testid="panel-expand">Expand code</collapsible.trigger>
						</collapsible.root>
					</tabs.content>
				}
			</div>
		</tabs.root>
	</div>
}
