import { modal } from '../../index.ts';

export default function Basic() @{
	<section>
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
