import { GroupLabel, GroupRoot, GroupTrigger } from './pwr-group.tsrx';

// Two sibling groups. Every part is written at the consumer site inside
// `<GroupRoot>`, but renders inside the pwr root that GroupRoot composed.
export default function PwrPage() @{
	<section data-pwr-page>
		<GroupRoot label="one">
			<GroupLabel>One</GroupLabel>
			<GroupTrigger />
		</GroupRoot>
		<GroupRoot label="two">
			<GroupLabel>Two</GroupLabel>
			<GroupTrigger />
		</GroupRoot>
	</section>
}
