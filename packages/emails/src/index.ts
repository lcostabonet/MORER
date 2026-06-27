import * as React from 'react';
import { render } from '@react-email/render';
import { OrderConfirmationEmail } from './templates/order-confirmation';
import { PasswordResetEmail } from './templates/password-reset';
import { ShippingConfirmationEmail } from './templates/shipping-confirmation';
import { VerifyEmailEmail } from './templates/verify-email';
import { WelcomeEmail } from './templates/welcome';

export type { OrderConfirmationData } from './templates/order-confirmation';
export type { PasswordResetData } from './templates/password-reset';
export { SUBJECT as PASSWORD_RESET_SUBJECT } from './templates/password-reset';
export type { ShippingConfirmationData } from './templates/shipping-confirmation';
export type { VerifyEmailData } from './templates/verify-email';
export { SUBJECT as VERIFY_EMAIL_SUBJECT } from './templates/verify-email';
export type { WelcomeData } from './templates/welcome';

/**
 * Renders the order_confirmation template to an HTML string.
 * Uses @react-email/render which does not perform any network calls.
 */
export async function renderOrderConfirmation(
  data: import('./templates/order-confirmation').OrderConfirmationData,
): Promise<string> {
  return render(React.createElement(OrderConfirmationEmail, data));
}

/**
 * Renders the shipping_confirmation template to an HTML string.
 * Uses @react-email/render which does not perform any network calls.
 */
export async function renderShippingConfirmation(
  data: import('./templates/shipping-confirmation').ShippingConfirmationData,
): Promise<string> {
  return render(React.createElement(ShippingConfirmationEmail, data));
}

/**
 * Renders the password_reset template to an HTML string.
 * Uses @react-email/render which does not perform any network calls.
 */
export async function renderPasswordReset(
  data: import('./templates/password-reset').PasswordResetData,
): Promise<string> {
  return render(React.createElement(PasswordResetEmail, data));
}

/**
 * Renders the verify_email template to an HTML string.
 * Uses @react-email/render which does not perform any network calls.
 */
export async function renderVerifyEmail(
  data: import('./templates/verify-email').VerifyEmailData,
): Promise<string> {
  return render(React.createElement(VerifyEmailEmail, data));
}

/**
 * Renders the welcome template to an HTML string.
 * Uses @react-email/render which does not perform any network calls.
 */
export async function renderWelcome(
  data: import('./templates/welcome').WelcomeData,
): Promise<string> {
  return render(React.createElement(WelcomeEmail, data));
}
