import { AehContent, AehOption, AehProbe, AehRoot } from './aeh-static.tsrx';

// Three hand-written options bind one array-typed handle. The read must answer
// all three, in the order they stand in the document.
export default function AehStaticPage() @{
	<section data-aeh-page>
		<AehRoot>
			<AehContent>
				<AehOption value="alpha" />
				<AehOption value="beta" />
				<AehOption value="gamma" />
			</AehContent>
			<AehProbe />
		</AehRoot>
	</section>
}
