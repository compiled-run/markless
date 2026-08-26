import { PluralItem, PluralRoot } from './plural.tsrx';

export default function PluralPage() @{
	<section data-hic-plural-page>
		<PluralRoot>
			<PluralItem value="alpha" />
			<PluralItem value="beta" />
			<PluralItem value="gamma" />
		</PluralRoot>
	</section>
}
