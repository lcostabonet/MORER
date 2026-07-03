import * as React from 'react';
import { render } from '@react-email/render';
import { ConfirmEmailChangeEmail } from './templates/confirm-email-change';
import { EmailChangedNoticeEmail } from './templates/email-changed-notice';
import { OrderConfirmationEmail } from './templates/order-confirmation';
import { PasswordChangedNoticeEmail } from './templates/password-changed-notice';
import { PasswordResetEmail } from './templates/password-reset';
import { ShippingConfirmationEmail } from './templates/shipping-confirmation';
import { VerifyEmailEmail } from './templates/verify-email';
import { WelcomeEmail } from './templates/welcome';

export type { ConfirmEmailChangeData } from './templates/confirm-email-change';
export { SUBJECT as CONFIRM_EMAIL_CHANGE_SUBJECT } from './templates/confirm-email-change';
export type { EmailChangedNoticeData } from './templates/email-changed-notice';
export { SUBJECT as EMAIL_CHANGED_NOTICE_SUBJECT } from './templates/email-changed-notice';
export type { OrderConfirmationData } from './templates/order-confirmation';
export type { PasswordChangedNoticeData } from './templates/password-changed-notice';
export { SUBJECT as PASSWORD_CHANGED_NOTICE_SUBJECT } from './templates/password-changed-notice';
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
 * Renders the confirm_email_change template (sent to the NEW address).
 * Uses @react-email/render which does not perform any network calls.
 */
export async function renderConfirmEmailChange(
  data: import('./templates/confirm-email-change').ConfirmEmailChangeData,
): Promise<string> {
  return render(React.createElement(ConfirmEmailChangeEmail, data));
}

/**
 * Renders the email_changed_notice template (sent to the OLD address).
 * Uses @react-email/render which does not perform any network calls.
 */
export async function renderEmailChangedNotice(
  data: import('./templates/email-changed-notice').EmailChangedNoticeData,
): Promise<string> {
  return render(React.createElement(EmailChangedNoticeEmail, data));
}

/**
 * Renders the password_changed_notice template (sent to the current address).
 * Uses @react-email/render which does not perform any network calls.
 */
export async function renderPasswordChangedNotice(): Promise<string> {
  return render(React.createElement(PasswordChangedNoticeEmail));
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
