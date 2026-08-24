import { state } from '@markless/core';
import { tabs } from '../../index.ts';

// Two tab sets with their own consumer handlers. Each handler writes into page
// state the page renders, so what the DOM shows is what the consumer's callback
// was actually called with, how often, and in what order relative to the
// consumer's own click handler on the trigger.
export default function WithOnChange() @{
	const log = state({ first: '', second: '', calls: 0, order: '' });

	<section>
		<tabs.root
			value="overview"
			data-testid="first-root"
			onChange={(next: string) => {
				log.first = next;
				log.calls = log.calls + 1;
				log.order = log.order + 'change';
			}}
		>
			<tabs.list data-testid="first-list">
				<tabs.trigger value="overview" data-testid="first-overview">Overview</tabs.trigger>
				<tabs.trigger
					value="usage"
					data-testid="first-usage"
					onClick={() => {
						log.order = log.order + '-click';
					}}
				>Usage</tabs.trigger>
			</tabs.list>
			<tabs.content value="overview" data-testid="first-overview-content">Overview.</tabs.content>
			<tabs.content value="usage" data-testid="first-usage-content">Usage.</tabs.content>
		</tabs.root>
		<tabs.root
			value="alpha"
			data-testid="second-root"
			onChange={(next: string) => {
				log.second = next;
				log.calls = log.calls + 1;
			}}
		>
			<tabs.list data-testid="second-list">
				<tabs.trigger value="alpha" data-testid="second-alpha">Alpha</tabs.trigger>
				<tabs.trigger value="beta" data-testid="second-beta">Beta</tabs.trigger>
			</tabs.list>
			<tabs.content value="alpha" data-testid="second-alpha-content">Alpha.</tabs.content>
			<tabs.content value="beta" data-testid="second-beta-content">Beta.</tabs.content>
		</tabs.root>
		<p data-testid="first-value">{log.first}</p>
		<p data-testid="second-value">{log.second}</p>
		<p data-testid="calls">{log.calls}</p>
		<p data-testid="order">{log.order}</p>
	</section>
}
