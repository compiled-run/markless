import { Lab, Root, Trigger } from './idref-widget.tsrx';

export default function IdrefWidgetPage() @{
	<section data-widget-page>
		<div data-widget="a">
			<Root label="A">
				<Trigger />
				<Lab />
			</Root>
		</div>
		<div data-widget="b">
			<Root label="B">
				<Trigger />
				<Lab />
			</Root>
		</div>
	</section>
}
