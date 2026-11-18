import type { PageProps } from '@markless/router';

export default function TodoPage({ params }: PageProps) @{
	<p data-todo-page>{params.id}</p>
}
