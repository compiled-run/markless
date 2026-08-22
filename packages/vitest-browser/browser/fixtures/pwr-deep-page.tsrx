import { DeepLabel, DeepRoot, DeepTrigger } from './pwr-deep-group.tsrx';

// Two sibling groups whose roots reach the family root through a second pure
// composer, so the chain a part follows is two links deep.
export default function PwrDeepPage() @{
	<section data-pwr-deep-page>
		<DeepRoot label="one">
			<DeepLabel>One</DeepLabel>
			<DeepTrigger />
		</DeepRoot>
		<DeepRoot label="two">
			<DeepLabel>Two</DeepLabel>
			<DeepTrigger />
		</DeepRoot>
	</section>
}
