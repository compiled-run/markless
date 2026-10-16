import { storage } from '@markless/core';
import { tabs } from '../../../headless/components/src/index.ts';

const MANAGERS = ['npm', 'pnpm', 'bun'];

export function App() @{
	let manager = storage('manager', 'npm');

	<main data-storage-bindings>
		<output data-manager-text>{manager}</output>
		<span data-manager-attr={manager}>attribute</span>
		<tabs.root value={manager} onChange={(next) => (manager = next)}>
			<tabs.list>
				@for (const id of MANAGERS; key id) {
					<tabs.trigger value={id} data-trigger={id}>{id}</tabs.trigger>
				}
			</tabs.list>
			@for (const id of MANAGERS; key id) {
				<tabs.content value={id} data-panel={id}>{id} panel</tabs.content>
			}
		</tabs.root>
	</main>
}
