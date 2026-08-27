import { state } from '@markless/core';
import { popover } from '../../index.ts';

// Two popovers with their own consumer handlers. Each handler writes into page
// state the page renders, so what the DOM shows is what the consumer's callback
// was actually called with, how often, and in what order relative to the
// consumer's own click handler on the trigger.
export default function WithOnChange() @{
	const log = state({ first: '', second: '', calls: 0, order: '' });

	<section>
		<button type="button" data-testid="background">Background</button>
		<popover.root
			data-testid="first-root"
			onChange={(next: boolean) => {
				log.first = String(next);
				log.calls = log.calls + 1;
				log.order = log.order + 'change';
			}}
		>
			<popover.trigger
				data-testid="first-trigger"
				onClick={() => {
					log.order = log.order + '-click';
				}}
			>Share</popover.trigger>
			<popover.content data-testid="first-content">
				<popover.title data-testid="first-title">Share</popover.title>
				<popover.close data-testid="first-close">Done</popover.close>
			</popover.content>
		</popover.root>
		<popover.root
			data-testid="second-root"
			onChange={(next: boolean) => {
				log.second = String(next);
				log.calls = log.calls + 1;
			}}
		>
			<popover.trigger data-testid="second-trigger">Export</popover.trigger>
			<popover.content data-testid="second-content">
				<popover.title data-testid="second-title">Export</popover.title>
				<popover.close data-testid="second-close">Done</popover.close>
			</popover.content>
		</popover.root>
		<p data-testid="first-value">{log.first}</p>
		<p data-testid="second-value">{log.second}</p>
		<p data-testid="calls">{log.calls}</p>
		<p data-testid="order">{log.order}</p>
	</section>
}
