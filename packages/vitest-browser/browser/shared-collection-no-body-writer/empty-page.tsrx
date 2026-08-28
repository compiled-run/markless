import { EmptyAdder, EmptyField, EmptyRoot } from './empty-family.tsrx';

export default function EmptyPage() @{
	<section data-page>
		<EmptyRoot>
			<EmptyField />
			<EmptyAdder />
		</EmptyRoot>
	</section>
}
