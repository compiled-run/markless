import { state } from '@markless/core';
import { tree } from '../../../headless/components/src/index.ts';

const SECTIONS = [{ title: 'alpha' }, { title: 'beta' }];

function Branch({ section, mark }: { readonly section: { readonly title: string }; readonly mark: string }) @{
	const seen = state({ title: '' });
	<div role="none">
		<tree.item level={1} aria-label={section.title} onChange={() => (seen.title = 'x:' + section.title)}>
			<tree.itemtrigger data-toggle={section.title}><img alt="" src={mark} /></tree.itemtrigger>
			<tree.itemcontent>c</tree.itemcontent>
		</tree.item>
		<span data-seen={section.title}>{seen.title}</span>
	</div>
}

export default function RowCallbackPage() @{
	const mark = 'm' + '#';
	<tree.root aria-label="sections">
		@for (const section of SECTIONS; key section.title) {
			<Branch section={section} mark={mark} />
		}
	</tree.root>
}
