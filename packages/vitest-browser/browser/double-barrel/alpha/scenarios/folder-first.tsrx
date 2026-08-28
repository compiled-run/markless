import * as alpha from '../index.ts';
import { beta } from '../../index.ts';

// `alpha` arrives as `../index.ts` here and as `./alpha/index.ts` inside the root
// barrel: two specifiers, one resolved module. Keying a module by the specifier
// that reached it makes the second spelling a stranger and `<alpha.root />` stops
// resolving, so both families rendering is the whole point of this page.
export default function FolderFirstPage() @{
	<main data-folder-first-page>
		<alpha.root>
			<alpha.label>alpha via its folder barrel</alpha.label>
		</alpha.root>
		<beta.root>
			<beta.label>beta via the root barrel</beta.label>
		</beta.root>
	</main>
}
