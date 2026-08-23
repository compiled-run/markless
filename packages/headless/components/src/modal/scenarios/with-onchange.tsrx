import { state } from '@markless/core';
import * as modal from '../index.ts';

// Two dialogs with their own consumer handlers. Each handler writes into page
// state the page renders, so what the DOM shows is what the consumer's callback
// was actually called with, how often, and in what order relative to the
// consumer's own click handler on the trigger.
export default function WithOnChange() @{
	const log = state({ first: '', second: '', calls: 0, order: '' });

	<section>
		<button type="button" data-testid="background">Background</button>
		<modal.root
			data-testid="first-root"
			onChange={(next: boolean) => {
				log.first = String(next);
				log.calls = log.calls + 1;
				log.order = log.order + 'change';
			}}
		>
			<modal.trigger
				data-testid="first-trigger"
				onClick={() => {
					log.order = log.order + '-click';
				}}
			>Shipping</modal.trigger>
			<modal.backdrop data-testid="first-backdrop">
				<modal.content data-testid="first-content">
					<modal.title data-testid="first-title">Shipping</modal.title>
					<modal.close data-testid="first-close">Done</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
		<modal.root
			data-testid="second-root"
			onChange={(next: boolean) => {
				log.second = String(next);
				log.calls = log.calls + 1;
			}}
		>
			<modal.trigger data-testid="second-trigger">Returns</modal.trigger>
			<modal.backdrop data-testid="second-backdrop">
				<modal.content data-testid="second-content">
					<modal.title data-testid="second-title">Returns</modal.title>
					<modal.close data-testid="second-close">Done</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
		<p data-testid="first-value">{log.first}</p>
		<p data-testid="second-value">{log.second}</p>
		<p data-testid="calls">{log.calls}</p>
		<p data-testid="order">{log.order}</p>
	</section>
}
