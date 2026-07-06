export function marklessSyncPolicyGraphIds(policy): string[] {
	if (!policy) return [];
	const branches = 'branches' in policy ? policy.branches : [policy];
	return [...new Set(branches.flatMap((branch) => marklessConditionGraphIds(branch.when)))].sort() as string[];
}

function marklessConditionGraphIds(condition): string[] {
	if (condition.type === 'graph-truthy') return [condition.graphNodeId];
	if (condition.type === 'and' || condition.type === 'or') return [...new Set(condition.conditions.flatMap(marklessConditionGraphIds))].sort() as string[];
	if (condition.type === 'not') return marklessConditionGraphIds(condition.condition);
	return [];
}
