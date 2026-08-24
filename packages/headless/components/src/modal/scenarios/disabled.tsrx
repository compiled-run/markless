import { modal } from '../../index.ts';

// `disabled` is not a prop this family ships. It reaches the underlying
// `<button>` through `{...rest}`, which is the whole point of spreading: the
// consumer already holds the default element's native surface. One root proves
// a disabled trigger will not open; the other proves a disabled close will not
// close the dialog it sits in.
export default function Disabled() @{
	<section>
		<button type="button" data-testid="background">Background</button>
		<modal.root data-testid="stuck-root">
			<modal.trigger data-testid="stuck-trigger" disabled>Edit address</modal.trigger>
			<modal.backdrop data-testid="stuck-backdrop">
				<modal.content data-testid="stuck-content">
					<modal.title data-testid="stuck-title">Edit delivery address</modal.title>
					<modal.close data-testid="stuck-close">Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
		<modal.root data-testid="open-root">
			<modal.trigger data-testid="open-trigger">Review order</modal.trigger>
			<modal.backdrop data-testid="open-backdrop">
				<modal.content data-testid="open-content">
					<modal.title data-testid="open-title">Review your order</modal.title>
					<modal.close data-testid="open-close" disabled>Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</section>
}
