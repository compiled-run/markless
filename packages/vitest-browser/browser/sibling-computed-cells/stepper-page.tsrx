import {
	StepperBackTrigger,
	StepperForwardTrigger,
	StepperReadout,
	StepperRoot,
} from './family/stepper.tsrx';

export default function SiblingComputedCellsPage() @{
	<section data-stepper-page>
		<StepperRoot>
			<StepperBackTrigger>Back</StepperBackTrigger>
			<StepperReadout />
			<StepperForwardTrigger>Next</StepperForwardTrigger>
		</StepperRoot>
	</section>
}
