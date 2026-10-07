import type { PageProps } from '@markless/router';

export default function ErrorCode({ params }: PageProps<{ code: string }>) @{
	<article data-page="error">{params.code}</article>
}
