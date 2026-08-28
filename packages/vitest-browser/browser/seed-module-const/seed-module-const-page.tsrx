import {
	GateArea,
	GateFactoryReadout,
	GateHeadroomReadout,
	GateReadout,
	GateRoot,
	GateTrigger,
	GateWriteTrigger,
} from './family/gate.tsrx';

export default function SeedModuleConstPage() @{
	<section data-gate-page>
		<GateRoot>
			<GateArea />
			<GateReadout />
			<GateFactoryReadout />
			<GateHeadroomReadout />
			<GateTrigger />
			<GateWriteTrigger />
		</GateRoot>
	</section>
}
