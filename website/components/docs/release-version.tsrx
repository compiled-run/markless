import corePackage from '../../../packages/core/package.json' with { type: 'json' };

/** The version every published Markless package shares, read from `@markless/core` when the site builds. */
export default function ReleaseVersion() @{
	<p>
		These pages follow Markless <strong>{corePackage.version}</strong>. Every package in the
		first two tables is on npm at that version.
	</p>
}
