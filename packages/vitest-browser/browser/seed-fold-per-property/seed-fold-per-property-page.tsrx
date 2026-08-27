import { BoxArea, BoxLimitReadout, BoxReadout, BoxRoot, BoxTrigger } from './family/box.tsrx';

export default function SeedFoldPerPropertyPage() @{
	<section data-box-page>
		<BoxRoot name="frame" disabled={true} defaultX={7} defaultWidth={12}>
			<BoxArea />
			<BoxReadout />
			<BoxLimitReadout />
			<BoxTrigger />
		</BoxRoot>
	</section>
}
