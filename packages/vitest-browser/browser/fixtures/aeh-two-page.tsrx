import { AehContent, AehOption, AehProbe, AehRoot } from './aeh-static.tsrx';

// Two widgets, different sets. Per-instance scoping has to hold for a SET the
// same way it holds for a single handle: instance one's probe must answer its
// own two options, never the union of both widgets' four.
export default function AehTwoPage() @{
	<section data-aeh-page>
		<AehRoot>
			<AehContent>
				<AehOption value="one-a" />
				<AehOption value="one-b" />
			</AehContent>
			<AehProbe />
		</AehRoot>
		<AehRoot>
			<AehContent>
				<AehOption value="two-a" />
				<AehOption value="two-b" />
			</AehContent>
			<AehProbe />
		</AehRoot>
	</section>
}
