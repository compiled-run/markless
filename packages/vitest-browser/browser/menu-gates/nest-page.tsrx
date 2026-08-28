import { NestAdd, NestBump, NestItems, NestOwnedItems, NestReadout, NestRoot } from './nest.tsrx';

export default function NestPage() @{
	<section data-nest-page>
		<NestRoot label="outer" data-testid="outer-root">
			<NestReadout data-testid="outer-readout" />
			<NestBump data-testid="outer-bump" />
			<NestAdd data-testid="outer-add" />
			<NestItems testid="outer-items" />
			<NestOwnedItems testid="outer-owned-items" />
			<div data-outer-slot>
				<NestRoot label="inner" data-testid="inner-root">
					<NestReadout data-testid="inner-readout" />
					<NestBump data-testid="inner-bump" />
					<NestAdd data-testid="inner-add" />
					<NestItems testid="inner-items" />
					<NestOwnedItems testid="inner-owned-items" />
				</NestRoot>
			</div>
		</NestRoot>
	</section>
}
