import { state } from '@markless/core';
import * as navbar from '../index.ts';

// The consumer's own callback, and the order it runs in. The handler writes into
// page state the page renders, so what the DOM shows is what the callback was
// actually called with, how often, and where the consumer's own click handler on
// the trigger fell relative to it.
//
// Closing reports the empty string rather than a name, because "nothing is
// showing" is a state the callback has to be able to say.
export default function WithOnChange() @{
	const log = state({ value: 'none', calls: 0, order: '' });

	<section>
		<navbar.root
			aria-label="Primary"
			hover={false}
			data-testid="root"
			onChange={(next: string) => {
				log.value = next === '' ? 'none' : next;
				log.calls = log.calls + 1;
				log.order = log.order + 'change';
			}}
		>
			<navbar.item value="products" data-testid="products-item">
				<navbar.itemtrigger
					data-testid="products-itemtrigger"
					onClick={() => {
						log.order = log.order + '-click';
					}}
				>Products</navbar.itemtrigger>
				<navbar.itemcontent data-testid="products-itemcontent">
					<navbar.itemlink href="/products/keyboards" data-testid="keyboards-itemlink">
						Keyboards
					</navbar.itemlink>
				</navbar.itemcontent>
			</navbar.item>
			<navbar.item value="docs" data-testid="docs-item">
				<navbar.itemtrigger data-testid="docs-itemtrigger">Docs</navbar.itemtrigger>
				<navbar.itemcontent data-testid="docs-itemcontent">
					<navbar.itemlink href="/docs/start" data-testid="start-itemlink">Getting started</navbar.itemlink>
				</navbar.itemcontent>
			</navbar.item>
		</navbar.root>
		<p data-testid="value">{log.value}</p>
		<p data-testid="calls">{log.calls}</p>
		<p data-testid="order">{log.order}</p>
	</section>
}
