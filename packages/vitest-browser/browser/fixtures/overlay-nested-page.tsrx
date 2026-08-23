import {
	InnerContent,
	InnerRoot,
	InnerTrigger,
	OuterContent,
	OuterRoot,
	OuterTrigger,
} from './overlay-nested.tsrx';

// The page lives in its own module, the way every other composed fixture here is
// laid out: the families and the page that arranges them are separate modules.
export default function OverlayNestedPage() @{
	<section data-nested-page>
		<button type="button" data-outside>Outside</button>
		<OuterRoot>
			<OuterTrigger />
			<OuterContent>
				<InnerRoot>
					<InnerTrigger />
					<InnerContent />
				</InnerRoot>
			</OuterContent>
		</OuterRoot>
	</section>
}
