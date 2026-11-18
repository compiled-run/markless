import ComputedEditView from './computed-edit-view.tsrx';

export function ComputedEditPage() @{
	<ComputedEditView params={{ id: 'a1' }} url={{ pathname: '/contacts/a1/edit', search: '?q=x' }} />
}
