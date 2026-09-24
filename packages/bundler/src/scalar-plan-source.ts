import { withQuery } from 'ufo';

export const MARKLESS_SCALAR_PLAN_SOURCE_QUERY = 'markless-scalar-plans';

export function scalarPlanSourceReference(source: string): string {
	return withQuery(source, {
		'markless-symbols': null,
		[MARKLESS_SCALAR_PLAN_SOURCE_QUERY]: null,
	});
}
