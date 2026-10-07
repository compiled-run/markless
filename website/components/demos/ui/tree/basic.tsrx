import Preview from '../../../ui/preview.tsrx';
import Files from './files.tsrx';

export default function TreeDemo({ shows }: { readonly shows: string }) @{
	<Preview shows={shows}>
		<Files />
	</Preview>
}
