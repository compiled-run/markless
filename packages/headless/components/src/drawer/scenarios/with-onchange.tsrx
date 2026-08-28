import { state } from '@markless/core';
import { drawer } from '../../index.ts';

// Two drawers on one page, each with its own consumer handlers. Every handler
// writes into page state the page renders, so what the DOM shows is what the
// consumer's callback was called with, how often, and in what order relative to
// the consumer's own click handler on the trigger.
export default function WithOnChange() @{
	const log = state({ first: '', second: '', calls: 0, order: '' });

	<section>
		<button type="button" data-testid="background">Background</button>
		<drawer.root
			data-testid="first-root"
			onChange={(next: boolean) => {
				log.first = String(next);
				log.calls = log.calls + 1;
				log.order = log.order + 'change';
			}}
		>
			<drawer.trigger
				data-testid="first-trigger"
				onClick={() => {
					log.order = log.order + '-click';
				}}
			>Sort</drawer.trigger>
			<drawer.backdrop data-testid="first-backdrop">
				<drawer.content data-testid="first-content">
					<drawer.title data-testid="first-title">Sort</drawer.title>
					<drawer.close data-testid="first-close">Done</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
		<drawer.root
			data-testid="second-root"
			onChange={(next: boolean) => {
				log.second = String(next);
				log.calls = log.calls + 1;
			}}
		>
			<drawer.trigger data-testid="second-trigger">Filter</drawer.trigger>
			<drawer.backdrop data-testid="second-backdrop">
				<drawer.content data-testid="second-content">
					<drawer.title data-testid="second-title">Filter</drawer.title>
					<drawer.close data-testid="second-close">Done</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
		<p data-testid="first-value">{log.first}</p>
		<p data-testid="second-value">{log.second}</p>
		<p data-testid="calls">{log.calls}</p>
		<p data-testid="order">{log.order}</p>
	</section>
}
