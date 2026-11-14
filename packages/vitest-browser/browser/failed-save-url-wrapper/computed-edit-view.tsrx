import { computed } from '@markless/core';
import { loadPerson } from './api.ts';
import ChildForm from './child-form.tsrx';
import ComputedShell from './computed-shell.tsrx';

type EditProps = {
	readonly params: { readonly id: string };
	readonly url: { readonly pathname: string; readonly search: string };
};

export default function ComputedEditView({ params, url }: EditProps) @{
	const person = computed(async () => loadPerson(params.id));
	<ComputedShell url={url}>
		@try {
			<ChildForm person={person} />
		} @catch (error) {
			<p data-caught>{error.message}</p>
		}
	</ComputedShell>
}
