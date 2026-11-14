import EditView from './edit-view.tsrx';

export function EditPage() @{
	<EditView params={{ id: 'a1' }} url={{ pathname: '/contacts/a1/edit', search: '?q=x' }} />
}
