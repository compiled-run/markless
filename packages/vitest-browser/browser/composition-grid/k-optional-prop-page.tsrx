import OptionalObject from './k-optional-object.tsrx';

export default function OptionalPropPage() @{
	<main>
		<section data-g="left-out">
			<OptionalObject />
		</section>
		<section data-g="passed">
			<OptionalObject item={{ name: 'Ada' }} />
		</section>
	</main>
}
