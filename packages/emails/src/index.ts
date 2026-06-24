import * as React from 'react';
import { render } from '@react-email/render';
import { OrderConfirmationEmail } from './templates/order-confirmation';
import { ShippingConfirmationEmail } from './templates/shipping-confirmation';

export type { OrderConfirmationData } from './templates/order-confirmation';
export type { ShippingConfirmationData } from './templates/shipping-confirmation';

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
