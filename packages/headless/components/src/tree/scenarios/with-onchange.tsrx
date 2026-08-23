import { state } from '@markless/core';
import * as tree from '../index.ts';

// Two nodes with their own consumer handlers, one of them nested inside the
// other. Each handler writes into page state the page renders, so what the DOM
// shows is what the consumer's callback was called with, how often, and in what
// order relative to the consumer's own click handler on the trigger.
export default function WithOnChange() @{
	const log = state({ src: '', ui: '', calls: 0, order: '' });

	<section>
		<tree.root aria-label="Project files" data-testid="root">
			<tree.item
				level={1}
				data-testid="src-item"
				onChange={(next: boolean) => {
					log.src = String(next);
					log.calls = log.calls + 1;
					log.order = log.order + 'change';
				}}
			>
				<tree.itemtrigger
					data-testid="src-itemtrigger"
					onClick={() => {
						log.order = log.order + '-click';
					}}
				>
					<tree.itemlabel data-testid="src-itemlabel">src</tree.itemlabel>
				</tree.itemtrigger>
				<tree.itemcontent data-testid="src-itemcontent">
					<tree.item
						open
						level={2}
						data-testid="ui-item"
						onChange={(next: boolean) => {
							log.ui = String(next);
							log.calls = log.calls + 1;
						}}
					>
						<tree.itemtrigger data-testid="ui-itemtrigger">Toggle</tree.itemtrigger>
						<tree.itemlabel data-testid="ui-itemlabel">ui</tree.itemlabel>
						<tree.itemcontent data-testid="ui-itemcontent">
							<tree.item leaf level={3} data-testid="button-item">
								<tree.itemlabel data-testid="button-itemlabel">button.tsrx</tree.itemlabel>
							</tree.item>
						</tree.itemcontent>
					</tree.item>
				</tree.itemcontent>
			</tree.item>
		</tree.root>
		<p data-testid="src-value">{log.src}</p>
		<p data-testid="ui-value">{log.ui}</p>
		<p data-testid="calls">{log.calls}</p>
		<p data-testid="order">{log.order}</p>
	</section>
}
