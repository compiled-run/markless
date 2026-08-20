import { Indicator, Root, Trigger } from './seedchk.tsrx';

export default function SeedChkPage() @{
	<section data-seed-page>
		<div data-widget="on">
			<Root checked={true}>
				<Trigger />
				<Indicator />
			</Root>
		</div>
		<div data-widget="off">
			<Root>
				<Trigger />
				<Indicator />
			</Root>
		</div>
	</section>
}
