import { SeededAdder, SeededField, SeededRoot } from './seeded-family.tsrx';

// The same family with its seeding root rendered: the parts reach a real
// instance, so nothing refuses.
export default function SeededPage() @{
	<section data-page>
		<SeededRoot items={['alpha', 'beta']}>
			<SeededField />
			<SeededAdder />
		</SeededRoot>
	</section>
}
