export type RowView = {
	readonly id: string;
	readonly name: string;
	readonly email: string;
	readonly role: string;
	readonly shown: boolean;
	readonly selected: boolean;
};

export type User = Omit<RowView, 'shown' | 'selected'>;

export function makeUsers(count: number): User[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `u${index}`,
		name: `User ${index}`,
		email: `user${index}@example.com`,
		role: index % 3 === 0 ? 'admin' : 'member',
	}));
}

export function viewRows(users: readonly User[], selected: readonly string[]): RowView[] {
	return users.map((user) => ({ ...user, shown: true, selected: selected.includes(user.id) }));
}

export function field<K extends keyof RowView>(rows: readonly RowView[], slot: number, key: K) {
	return rows[slot]?.[key];
}

export function toggle(selected: readonly string[], id: string | undefined): string[] {
	if (id === undefined) return [...selected];
	return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
}
