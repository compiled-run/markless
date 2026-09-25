// Boxes that witness one-chunk-per-module preload and chunk behaviour build their fixture with `packing: false`.
export function unpackedFixture<Context, Result>(
	run: (context: Context) => Promise<Result>,
): (context: Context) => Promise<Result> {
	return async (context) => {
		const previous = process.env.MARKLESS_FIXTURE_NATIVE_PACKING;
		process.env.MARKLESS_FIXTURE_NATIVE_PACKING = '0';
		try {
			return await run(context);
		} finally {
			if (previous === undefined) delete process.env.MARKLESS_FIXTURE_NATIVE_PACKING;
			else process.env.MARKLESS_FIXTURE_NATIVE_PACKING = previous;
		}
	};
}
