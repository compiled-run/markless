import { Mark } from './part.tsrx';

// The same adoption one level down: the page composes the adopting PART and no
// component roots the family, so the part's own instance is the outermost one.
export default function OutermostPartPage() @{
	<section data-outermost-part-page>
		<Mark name="louder" />
	</section>
}
