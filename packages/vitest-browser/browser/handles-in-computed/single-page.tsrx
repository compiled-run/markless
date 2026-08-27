import { SingleRoot } from './single.tsrx';

export default function SinglePage() @{
	<section data-hic-single-page>
		<SingleRoot>
			<span data-hic-single-child>child</span>
		</SingleRoot>
	</section>
}
