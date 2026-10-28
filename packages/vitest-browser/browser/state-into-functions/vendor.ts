export function tidyEmail(form: { email: string }): void {
	form.email = form.email.trim().toLowerCase();
}
