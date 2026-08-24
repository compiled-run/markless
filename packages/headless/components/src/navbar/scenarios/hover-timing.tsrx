import { navbar } from '../../index.ts';

// The delay is short so the suite can wait it out honestly rather than faking a
// clock: 60 ms is long enough that "opened before the delay" is a real failure
// and short enough that a poll does not stall the lane.
//
// The behaviour under test is QDS's model, and it beats the surveyed libraries':
// the delay applies to the COLD start only. Once any dropdown is showing,
// moving to another opens it at once, because a person already browsing the
// navbar expects the next panel immediately.
export default function HoverTiming() @{
	<navbar.root aria-label="Primary" delay={60} clickGrace={0} data-testid="root">
		<navbar.item value="products" data-testid="products-item">
			<navbar.itemtrigger data-testid="products-itemtrigger">Products</navbar.itemtrigger>
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
}
