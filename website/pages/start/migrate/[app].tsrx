import AppPage from '../../../components/docs/showcase/app-page.tsrx';

export default function MigratedAppPage({
	params,
}: {
	readonly params: { readonly app: string };
}) @{
	<AppPage slug={String(params.app)} />;
}
