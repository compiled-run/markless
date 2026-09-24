import { computed, element, state } from '@markless/core';
import Layout from '../src/layout.tsrx';
import {
	SETTINGS_ENDPOINT,
	SETTINGS_INITIAL,
	SETTINGS_NETWORK_ERROR_MESSAGE,
	SETTINGS_PENDING_TEXT,
	SETTINGS_SUBMIT_TEXT,
	hasErrors,
	settingsTotalText,
	validateSettings,
	type SettingsErrors,
	type SettingsResponseBody,
} from '../src/shared/data.ts';

export default function Settings() @{
	let name = state(SETTINGS_INITIAL.name);
	let email = state(SETTINGS_INITIAL.email);
	let quantity = state(SETTINGS_INITIAL.quantity);
	let unitPrice = state(SETTINGS_INITIAL.unitPrice);
	let attempted = state(false);
	let pending = state(false);
	let status = state('');
	let serverError = state('');
	const nameEl = element<HTMLInputElement>();
	const emailEl = element<HTMLInputElement>();
	const quantityEl = element<HTMLInputElement>();
	const unitPriceEl = element<HTMLInputElement>();

	const errors = computed((): SettingsErrors =>
		attempted ? validateSettings({ name, email, quantity, unitPrice }) : {},
	);
	const total = computed(() => settingsTotalText({ quantity, unitPrice }));
	const submitText = computed(() => (pending ? SETTINGS_PENDING_TEXT : SETTINGS_SUBMIT_TEXT));
	const hasServerError = computed(() => serverError !== '');

	<Layout route="settings">
		<form
			class="form"
			data-testid="settings-form"
			novalidate
			onSubmit={async (event) => {
				event.preventDefault();
				if (pending) return;
				attempted = true;
				const values = { name, email, quantity, unitPrice };
				const found = validateSettings(values);
				if (hasErrors(found)) {
					if (found.name) nameEl?.focus();
					else if (found.email) emailEl?.focus();
					else if (found.quantity) quantityEl?.focus();
					else unitPriceEl?.focus();
					return;
				}
				pending = true;
				status = SETTINGS_PENDING_TEXT;
				serverError = '';
				try {
					const response = await fetch(SETTINGS_ENDPOINT, {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(values),
					});
					const body = (await response.json()) as SettingsResponseBody;
					if (response.status === 200 && body.ok) {
						status = body.message;
					} else {
						status = '';
						serverError = body.ok ? SETTINGS_NETWORK_ERROR_MESSAGE : body.error;
					}
				} catch {
					status = '';
					serverError = SETTINGS_NETWORK_ERROR_MESSAGE;
				} finally {
					pending = false;
				}
			}}
		>
			<div class="field">
				<label class="field-label" for="settings-name">Display name</label>
				<input
					el={nameEl}
					class="input"
					type="text"
					id="settings-name"
					data-testid="settings-name"
					value={name}
					aria-invalid={errors.name ? 'true' : undefined}
					aria-describedby={errors.name ? 'settings-name-error' : undefined}
					onInput={(event) => (name = (event.target as HTMLInputElement).value)}
				/>
				@if (errors.name) {
					<p class="field-error" id="settings-name-error" data-testid="settings-name-error">{errors.name}</p>
				}
			</div>
			<div class="field">
				<label class="field-label" for="settings-email">Email</label>
				<input
					el={emailEl}
					class="input"
					type="email"
					id="settings-email"
					data-testid="settings-email"
					value={email}
					aria-invalid={errors.email ? 'true' : undefined}
					aria-describedby={errors.email ? 'settings-email-error' : undefined}
					onInput={(event) => (email = (event.target as HTMLInputElement).value)}
				/>
				@if (errors.email) {
					<p class="field-error" id="settings-email-error" data-testid="settings-email-error">{errors.email}</p>
				}
			</div>
			<div class="field">
				<label class="field-label" for="settings-quantity">Quantity</label>
				<input
					el={quantityEl}
					class="input"
					type="text"
					inputmode="numeric"
					id="settings-quantity"
					data-testid="settings-quantity"
					value={quantity}
					aria-invalid={errors.quantity ? 'true' : undefined}
					aria-describedby={errors.quantity ? 'settings-quantity-error' : undefined}
					onInput={(event) => (quantity = (event.target as HTMLInputElement).value)}
				/>
				@if (errors.quantity) {
					<p class="field-error" id="settings-quantity-error" data-testid="settings-quantity-error">{errors.quantity}</p>
				}
			</div>
			<div class="field">
				<label class="field-label" for="settings-unit-price">Unit price</label>
				<input
					el={unitPriceEl}
					class="input"
					type="text"
					inputmode="decimal"
					id="settings-unit-price"
					data-testid="settings-unit-price"
					value={unitPrice}
					aria-invalid={errors.unitPrice ? 'true' : undefined}
					aria-describedby={errors.unitPrice ? 'settings-unit-price-error' : undefined}
					onInput={(event) => (unitPrice = (event.target as HTMLInputElement).value)}
				/>
				@if (errors.unitPrice) {
					<p class="field-error" id="settings-unit-price-error" data-testid="settings-unit-price-error">{errors.unitPrice}</p>
				}
			</div>
			<p class="derived" data-testid="settings-total">{total}</p>
			<div class="form-actions">
				<button type="submit" class="button button-primary" data-testid="settings-submit" disabled={pending}>
					{submitText}
				</button>
				<p class="status" data-testid="settings-status" role="status">{status}</p>
			</div>
			@if (hasServerError) {
				<p class="alert" data-testid="settings-error" role="alert">{serverError}</p>
			}
		</form>
	</Layout>
}
