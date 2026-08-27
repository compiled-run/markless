import { Disclosure } from './idref-in-arm.tsrx';

export default function IdrefInArmOpenPage() @{
	<section data-page>
		<Disclosure label="one" startOpen={true} />
		<Disclosure label="two" startOpen={true} />
	</section>
}
