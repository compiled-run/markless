import { NestAdd, NestItems, NestOwnedItems, NestRoot } from './nest.tsrx';

// The control for the nested page: one root of the same family with nothing
// inside it, so a row that fails to mint here is not about nesting.
export default function NestSinglePage() @{
	<section data-nest-single-page>
		<NestRoot label="only" data-testid="only-root">
			<NestAdd data-testid="only-add" />
			<NestItems testid="only-items" />
			<NestOwnedItems testid="only-owned-items" />
		</NestRoot>
	</section>
}
