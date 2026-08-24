import { modal } from '../../index.ts';

export default function Nested() @{
	<section>
		<button type="button" data-testid="background">Background</button>
		<modal.root data-testid="outer-root">
			<modal.trigger data-testid="outer-trigger">Add delivery address</modal.trigger>
			<modal.backdrop data-testid="outer-backdrop">
				<modal.content data-testid="outer-content">
					<modal.title data-testid="outer-title">Add delivery address</modal.title>
					<modal.root data-testid="inner-root">
						<modal.trigger data-testid="inner-trigger">Verify address</modal.trigger>
						<modal.backdrop data-testid="inner-backdrop">
							<modal.content data-testid="inner-content">
								<modal.title data-testid="inner-title">Address added</modal.title>
								<modal.close data-testid="inner-close">OK</modal.close>
							</modal.content>
						</modal.backdrop>
					</modal.root>
					<modal.close data-testid="outer-close">Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</section>
}
