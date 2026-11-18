import type { PageProps } from '@markless/router';

export default function EditPage({ params }: PageProps<{ id: string }>) @{
	<p data-g="edit">editing {params.id}</p>
}
