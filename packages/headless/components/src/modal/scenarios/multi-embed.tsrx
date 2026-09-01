import { modal } from '../../index.ts';

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. Both islands run this module, so both spell identical
// instance paths — which is the point of the shape. The background button sits
// outside the dialog so an outside press has somewhere of its own to land.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<button type="button" data-testid="background">Background</button>
		<modal.root data-testid="root">
			<modal.trigger data-testid="trigger">Edit address</modal.trigger>
			<modal.backdrop data-testid="backdrop">
				<modal.content data-testid="content">
					<modal.title data-testid="title">Edit delivery address</modal.title>
					<button type="button" data-testid="save">Save</button>
					<modal.close data-testid="close">Cancel</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</section>
}
