import { TallyArea, TallyReadout, TallyRoot } from './family/tally.tsrx';

export default function MethodReadsComputedTwoRootsPage() @{
	<section data-two-roots-page>
		<div data-first>
			<TallyRoot marks={['a']}>
				<TallyArea />
				<TallyReadout />
			</TallyRoot>
		</div>
		<div data-second>
			<TallyRoot marks={['p', 'q']}>
				<TallyArea />
				<TallyReadout />
			</TallyRoot>
		</div>
	</section>
}
