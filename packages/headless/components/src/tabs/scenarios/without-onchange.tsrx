import { state } from '@markless/core';
import { tabs } from '../../index.ts';

// No onChange anywhere. Tabs still change; the call site simply does nothing.
// The counter proves nothing else on the page moved.
export default function WithoutOnChange() @{
	const log = state({ calls: 0 });

	<section>
		<tabs.root value="overview" data-testid="root">
			<tabs.list data-testid="list">
				<tabs.trigger value="overview" data-testid="overview-trigger">Overview</tabs.trigger>
				<tabs.trigger value="usage" data-testid="usage-trigger">Usage</tabs.trigger>
			</tabs.list>
			<tabs.content value="overview" data-testid="overview-content">Overview.</tabs.content>
			<tabs.content value="usage" data-testid="usage-content">Usage.</tabs.content>
		</tabs.root>
		<p data-testid="calls">{log.calls}</p>
	</section>
}
