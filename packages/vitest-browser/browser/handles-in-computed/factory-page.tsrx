import { FactoryItem, FactoryRoot } from './factory.tsrx';

export default function FactoryPage() @{
	<section data-hic-factory-page>
		<FactoryRoot>
			<FactoryItem value="alpha" />
			<FactoryItem value="beta" />
			<FactoryItem value="gamma" />
		</FactoryRoot>
	</section>
}
