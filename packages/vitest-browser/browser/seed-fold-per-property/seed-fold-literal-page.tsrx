import {
	BoxLiteralArea,
	BoxLiteralLimitReadout,
	BoxLiteralReadout,
	BoxLiteralRoot,
	BoxLiteralTrigger,
} from './family/box-literal.tsrx';

export default function SeedFoldLiteralPage() @{
	<section data-box-page>
		<BoxLiteralRoot name="frame" disabled={true} defaultX={7} defaultWidth={12}>
			<BoxLiteralArea />
			<BoxLiteralReadout />
			<BoxLiteralLimitReadout />
			<BoxLiteralTrigger />
		</BoxLiteralRoot>
	</section>
}
