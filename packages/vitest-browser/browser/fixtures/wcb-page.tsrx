import { GrpCount, GrpLabel, GrpLast, GrpRoot, GrpTrigger } from './wcb-group.tsrx';

// Two sibling groups. A gesture on one group's trigger must reach THAT group's
// handler and no other.
export default function WcbPage() @{
	<section data-wcb-page>
		<GrpRoot name="one">
			<GrpLabel>One</GrpLabel>
			<GrpTrigger />
			<GrpCount />
			<GrpLast />
		</GrpRoot>
		<GrpRoot name="two">
			<GrpLabel>Two</GrpLabel>
			<GrpTrigger />
			<GrpCount />
			<GrpLast />
		</GrpRoot>
	</section>
}
