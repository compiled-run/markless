import Preview from '../../../ui/preview.tsrx';
import Files from './example.tsrx';

export default function GridListDemo({ shows }: { readonly shows: string }) @{
	<Preview shows={shows}>
		<Files />
	</Preview>
}
