import * as drawer from '../index.ts';

// Recursive composition: a drawer inside a drawer's surface is the same parts,
// and the inner root is its own widget-scoped instance. There is no nested root
// part and no `nested` prop.
export default function Nested() @{
	<section>
		<button type="button" data-testid="background">Background</button>
		<drawer.root data-testid="outer-root">
			<drawer.trigger data-testid="outer-trigger">Payment method</drawer.trigger>
			<drawer.backdrop data-testid="outer-backdrop">
				<drawer.content data-testid="outer-content">
					<drawer.title data-testid="outer-title">Choose a payment method</drawer.title>
					<drawer.root data-testid="inner-root">
						<drawer.trigger data-testid="inner-trigger">Add a card</drawer.trigger>
						<drawer.backdrop data-testid="inner-backdrop">
							<drawer.content data-testid="inner-content">
								<drawer.title data-testid="inner-title">Card added</drawer.title>
								<drawer.close data-testid="inner-close">OK</drawer.close>
							</drawer.content>
						</drawer.backdrop>
					</drawer.root>
					<drawer.close data-testid="outer-close">Cancel</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
	</section>
}
