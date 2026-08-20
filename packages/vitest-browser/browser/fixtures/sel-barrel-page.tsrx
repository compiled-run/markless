import * as sel from './sel-barrel.ts';

export default function SelBarrelPage() @{
	<section data-sel-barrel-page>
		<div data-widget="a">
			<sel.root>
				<sel.trigger />
				<sel.content />
			</sel.root>
		</div>
		<div data-widget="b">
			<sel.root>
				<sel.trigger />
				<sel.content />
			</sel.root>
		</div>
	</section>
}
