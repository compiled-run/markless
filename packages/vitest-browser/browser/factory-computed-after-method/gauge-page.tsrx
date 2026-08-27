import {
	GaugeArea,
	GaugeHandlerTrigger,
	GaugeMethodTrigger,
	GaugeReadout,
	GaugeRoot,
} from './family/gauge.tsrx';

export default function FactoryComputedAfterMethodPage() @{
	<section data-gauge-page>
		<GaugeRoot>
			<GaugeArea />
			<GaugeReadout />
			<GaugeMethodTrigger />
			<GaugeHandlerTrigger />
		</GaugeRoot>
	</section>
}
