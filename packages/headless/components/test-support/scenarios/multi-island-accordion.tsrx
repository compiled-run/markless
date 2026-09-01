import WrapperFaq from './wrapper-faq.tsrx';
import WrapperFrame from './wrapper-frame.tsrx';

// One island's worth of page: the same wrapper-projected accordion shape
// wrapper-projected-accordion.tsrx renders, mounted TWICE as two separate
// islands by the multi-island suite. Both islands run this module, so both
// spell the same widget ids — which is the point of the shape.
export default function MultiIslandAccordion() @{
	<section>
		<WrapperFrame>
			<WrapperFaq />
		</WrapperFrame>
	</section>
}
