import {
	GateArea,
	GateFactoryReadout,
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
			<GateTrigger />
			<GateWriteTrigger />
		</GateRoot>
	</section>
}
