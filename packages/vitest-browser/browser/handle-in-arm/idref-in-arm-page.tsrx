import { Disclosure } from './idref-in-arm.tsrx';

export default function IdrefInArmPage() @{
	<section data-page>
		<Disclosure label="one" startOpen={false} />
		<Disclosure label="two" startOpen={false} />
	</section>
}
