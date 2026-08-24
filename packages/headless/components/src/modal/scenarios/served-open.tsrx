import { modal } from '../../index.ts';

export default function ServedOpen() @{
	<section>
		<button type="button" data-testid="background">Background</button>
		<modal.root data-testid="root" open>
			<modal.backdrop data-testid="backdrop">
				<modal.content data-testid="content">
					<modal.title data-testid="title">Accept the terms</modal.title>
					<modal.close data-testid="close">Accept</modal.close>
				</modal.content>
			</modal.backdrop>
		</modal.root>
	</section>
}
