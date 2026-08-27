import { state } from '@markless/core';
import { togglegroup } from '../../index.ts';

// Two groups with their own consumer handlers, one of each shape. Each handler
// writes into page state the page renders, so what the DOM shows is what the
// callback was actually called with, how often, and in what order relative to
// the consumer's own click handler on the item.
export default function WithOnChange() @{
	const log = state({ single: '', many: '', calls: 0, order: '' });

	<section>
		<togglegroup.root
			value="left"
			data-testid="root"
			onChange={(next: string | readonly string[]) => {
				log.single = `${next}`;
				log.calls = log.calls + 1;
				log.order = log.order + 'change';
			}}
		>
			<togglegroup.label data-testid="label">Text alignment</togglegroup.label>
			<togglegroup.item value="left" data-testid="left">Left</togglegroup.item>
			<togglegroup.item
				value="center"
				data-testid="center"
				onClick={() => {
					log.order = log.order + '-click';
				}}
			>Center</togglegroup.item>
		</togglegroup.root>
		<togglegroup.root
			multiple
			value={['bold']}
			data-testid="many-root"
			onChange={(next: string | readonly string[]) => {
				log.many = `${next}`;
				log.calls = log.calls + 1;
			}}
		>
			<togglegroup.label data-testid="many-label">Text style</togglegroup.label>
			<togglegroup.item value="bold" data-testid="bold">Bold</togglegroup.item>
			<togglegroup.item value="italic" data-testid="italic">Italic</togglegroup.item>
		</togglegroup.root>
		<p data-testid="single-value">{log.single}</p>
		<p data-testid="many-value">{log.many}</p>
		<p data-testid="calls">{log.calls}</p>
		<p data-testid="order">{log.order}</p>
	</section>
}
