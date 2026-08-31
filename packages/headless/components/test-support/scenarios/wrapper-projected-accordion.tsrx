import WrapperFaq from './wrapper-faq.tsrx';
import WrapperFrame from './wrapper-frame.tsrx';

// One wrapper deeper than page level: the component that composes the family is
// projected through another component's children, so the family root is filed at
// the page path the frame placed it at while the trigger reads with the faq
// module's own path. Every other scenario in this package composes its family in
// the page module, where those two paths are the same string.
export default function WrapperProjectedAccordion() @{
	<section>
		<WrapperFrame>
			<WrapperFaq />
		</WrapperFrame>
	</section>
}
