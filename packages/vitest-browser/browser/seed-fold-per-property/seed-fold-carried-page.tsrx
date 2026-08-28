import {
	BoxCarriedArea,
	BoxCarriedLimitReadout,
	BoxCarriedReadout,
	BoxCarriedRoot,
	BoxCarriedTrigger,
} from './family/box-carried.tsrx';

export default function SeedFoldCarriedPage() @{
	<section data-box-page>
		<BoxCarriedRoot name="frame" disabled={true} defaultX={7} defaultWidth={12}>
			<BoxCarriedArea />
			<BoxCarriedReadout />
			<BoxCarriedLimitReadout />
			<BoxCarriedTrigger />
		</BoxCarriedRoot>
	</section>
}
