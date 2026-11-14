import { computed } from '@markless/core';
import type { Children } from '@markless/core';

type ShellProps = {
	readonly url: { readonly pathname: string; readonly search: string };
	readonly children?: Children;
};

export default function ComputedShell({ url, children }: ShellProps) @{
	const q = computed(() => new URLSearchParams(url.search).get('q') ?? '');
	<div>
		<p data-q>q={q}</p>
		{children}
	</div>
}
