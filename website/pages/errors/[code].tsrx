import ErrorPage from '../../components/docs/errors/error-page.tsrx';

export default function ErrorCodePage({
	params,
}: {
	readonly params: { readonly code: string };
}) @{
	<ErrorPage code={String(params.code)} />;
}
