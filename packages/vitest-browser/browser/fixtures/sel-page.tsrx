import { Content, Root, Trigger } from './sel.tsrx';

export default function SelPage() @{
	<section data-sel-page>
		<div data-widget="a">
			<Root>
				<Trigger />
				<Content />
			</Root>
		</div>
		<div data-widget="b">
			<Root>
				<Trigger />
				<Content />
			</Root>
		</div>
	</section>
}
