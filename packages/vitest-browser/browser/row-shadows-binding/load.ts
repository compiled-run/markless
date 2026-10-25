export async function load<T>(value: T, ms = 30): Promise<T> {
	await new Promise((resolve) => setTimeout(resolve, ms));
	return value;
}
