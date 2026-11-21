export function place(latitude: number, longitude: number): string {
	return `At ${latitude.toFixed(2)}, ${longitude.toFixed(3)}`;
}

