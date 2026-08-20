import { Content, PopRoot, PopTrigger, Root, Trigger } from './sel.tsrx';

export default function SelNestedPage() @{
	<section data-sel-nested>
		<Root>
			<Trigger />
			<Content />
			<PopRoot>
				<PopTrigger />
			</PopRoot>
		</Root>
	</section>
}
