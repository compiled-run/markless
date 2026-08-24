import { MbField, MbGroup, MbItem, MbLabel, MbProbe, MbWalk } from './mb-radio.tsrx';

// One group, three items. Each item's input is a member of the group's set AND
// the target of that item's own label - two widget instances on one element.
export default function MbRadioPage() @{
	<section data-mb-page>
		<MbGroup>
			<MbItem>
				<MbField value="alpha" />
				<MbLabel>Alpha</MbLabel>
				<MbProbe />
			</MbItem>
			<MbItem>
				<MbField value="beta" />
				<MbLabel>Beta</MbLabel>
				<MbProbe />
			</MbItem>
			<MbItem>
				<MbField value="gamma" />
				<MbLabel>Gamma</MbLabel>
				<MbProbe />
			</MbItem>
			<MbWalk />
		</MbGroup>
	</section>
}
