import * as React from 'react';
import { render } from '@react-email/render';
import { OrderConfirmationEmail } from './templates/order-confirmation';

export type { OrderConfirmationData } from './templates/order-confirmation';

/**
 * Renders the order_confirmation template to an HTML string.
 * Uses @react-email/render which does not perform any network calls.
 */
export async function renderOrderConfirmation(
  data: import('./templates/order-confirmation').OrderConfirmationData,
): Promise<string> {
  return render(React.createElement(OrderConfirmationEmail, data));
}
