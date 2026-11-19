import { Link } from '@markless/router';

export default function BackLink({ to, label }: { readonly to: string; readonly label: string }) @{
	<Link href={to}>{label}</Link>
}
