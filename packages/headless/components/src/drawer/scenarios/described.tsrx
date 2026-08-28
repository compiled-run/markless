import { drawer } from '../../index.ts';

export default function Described() @{
	<section>
		<button type="button" data-testid="background">Background</button>
		<drawer.root data-testid="root">
			<drawer.trigger data-testid="trigger">Review order</drawer.trigger>
			<drawer.backdrop data-testid="backdrop">
				<drawer.content data-testid="content">
					<drawer.title data-testid="title">Review your order</drawer.title>
					<drawer.description data-testid="description">
						Swipe down to put this away and nothing is charged.
					</drawer.description>
					<drawer.close data-testid="close">Not yet</drawer.close>
				</drawer.content>
			</drawer.backdrop>
		</drawer.root>
	</section>
}
