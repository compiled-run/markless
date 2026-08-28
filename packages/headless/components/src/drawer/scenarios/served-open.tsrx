import * as drawer from '../index.ts';

export default function ServedOpen() @{
	<section>
		<button type="button" data-testid="background">Background</button>
		<drawer.root data-testid="root" open>
			<drawer.backdrop data-testid="backdrop">
				<drawer.content data-testid="content">
					<drawer.title data-testid="title">Where should we deliver?</drawer.title>
					<drawer.close data-testid="close">Use this address</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
	</section>
}
