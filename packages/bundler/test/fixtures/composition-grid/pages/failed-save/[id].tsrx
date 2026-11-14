import { computed } from '@markless/core';
import { Link, type PageProps } from '@markless/router';
import { loadPerson } from '../../../../../../vitest-browser/browser/failed-save-url-wrapper/api.ts';
import ChildForm from '../../../../../../vitest-browser/browser/failed-save-url-wrapper/child-form.tsrx';
import Shell from '../../../../../../vitest-browser/browser/failed-save-url-wrapper/shell.tsrx';

export default function Page({ params, url }: PageProps<{ id: string }>) @{
	const person = computed(async () => loadPerson(params.id));
	<Shell url={url}>
		<Link href="/failed-save/b8?q=y" data-next>Next</Link>
		@try {
			<ChildForm person={person} />
		} @catch (error) {
			<p data-caught>{error.message}</p>
		}
	</Shell>
}
