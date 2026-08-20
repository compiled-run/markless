import { Indicator, Root, Trigger } from './chk.tsrx';

export default function ChkPage() @{
	<section data-chk-page>
		<div data-widget="a">
			<Root disabled={true} name="alpha">
				<Trigger />
				<Indicator />
			</Root>
		</div>
		<div data-widget="b">
			<Root>
				<Trigger />
				<Indicator />
			</Root>
		</div>
	</section>
}
