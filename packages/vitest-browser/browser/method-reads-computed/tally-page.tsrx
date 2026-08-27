import { TallyArea, TallyControl, TallyReadout, TallyRoot } from './family/tally.tsrx';

export default function MethodReadsComputedPage() @{
	<section data-tally-page>
		<TallyRoot marks={['a']}>
			<TallyArea />
			<TallyControl />
			<TallyReadout />
		</TallyRoot>
	</section>
}
