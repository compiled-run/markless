import { Readout, Root } from './seed-defaults.tsrx';

export default function SeedDefaultsPage() @{
	<section data-sd-page>
		<div data-widget="passed">
			<Root tone="loud" level={3}>
				<Readout />
			</Root>
		</div>
		<div data-widget="omitted">
			<Root>
				<Readout />
			</Root>
		</div>
	</section>
}
