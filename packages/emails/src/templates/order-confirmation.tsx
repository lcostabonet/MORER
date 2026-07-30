import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

// Immutable address snapshot taken at order time (Phase 11E). Kept in sync with
// the API's OrderAddressSnapshot shape; this package cannot import from apps/api.
export interface OrderConfirmationAddress {
  fullName: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  province: string;
  countryCode: string;
}

// Shipping method snapshot (Phase 11F). Null → neutral fallback.
export interface OrderConfirmationShippingMethod {
  code: string;
  name: string;
  description: string;
}

export interface OrderConfirmationData {
  orderNumber: string;
  items: Array<{
    productName: string;
    variantSize: string;
    quantity: number;
    priceInCents: number;
  }>;
  totalInCents: number;
  currency: string;
  // Money breakdown (Phase 11F). Optional so existing callers/tests keep working;
  // legacy fallback: subtotal defaults to total, shipping/tax default to 0.
  subtotalInCents?: number;
  shippingInCents?: number;
  taxInCents?: number;
  shippingMethod?: OrderConfirmationShippingMethod | null;
  // Optional so existing callers/tests keep working. Null → neutral fallback.
  shippingAddress?: OrderConfirmationAddress | null;
  billingAddress?: OrderConfirmationAddress | null;
}

const ADDRESS_UNAVAILABLE = 'Dirección no disponible para este pedido.';
const SHIPPING_METHOD_UNAVAILABLE = 'Método de envío no disponible.';

// Postal formatting shared with the web helper (kept intentionally simple/local).
function formatAddressLines(address: OrderConfirmationAddress): string[] {
  const country = address.countryCode === 'ES' ? 'España' : address.countryCode;
  return [
    address.fullName,
    address.line1,
    address.line2,
    `${address.postalCode} ${address.city}, ${address.province}`,
    country,
    address.phone,
  ].filter((line): line is string => typeof line === 'string' && line.trim() !== '');
}

function AddressBlock({
  title,
  address,
}: {
  title: string;
  address: OrderConfirmationAddress | null | undefined;
}) {
  return (
    <Section style={{ marginBottom: '16px' }}>
      <Heading
        as="h3"
        style={{
          fontSize: '11px',
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: '#6b7280',
          margin: '0 0 8px',
        }}
      >
        {title}
      </Heading>
      {address ? (
        formatAddressLines(address).map((line, index) => (
          <Text key={index} style={{ margin: '0 0 2px', fontSize: '13px', color: '#374151' }}>
            {line}
          </Text>
        ))
      ) : (
        <Text style={{ margin: 0, fontSize: '13px', color: '#9ca3af' }}>{ADDRESS_UNAVAILABLE}</Text>
      )}
    </Section>
  );
}

function formatPrice(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

const base: React.CSSProperties = {
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  backgroundColor: '#ffffff',
  color: '#1a1a1a',
};

const container: React.CSSProperties = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: '32px 24px',
};

export function OrderConfirmationEmail({
  orderNumber,
  items,
  totalInCents,
  currency,
  subtotalInCents,
  shippingInCents,
  taxInCents,
  shippingMethod,
  shippingAddress,
  billingAddress,
}: OrderConfirmationData) {
  const subtotal = subtotalInCents ?? totalInCents;
  const shipping = shippingInCents ?? 0;
  const tax = taxInCents ?? 0;
  const shippingLabel = shipping === 0 ? 'Gratis' : formatPrice(shipping, currency);
  return (
    <Html lang="es">
      <Head />
      <Preview>Confirmación de tu pedido {orderNumber} — MORER</Preview>
      <Body style={base}>
        <Container style={container}>
          <Heading
            as="h1"
            style={{ fontSize: '22px', fontWeight: '700', letterSpacing: '-0.5px', margin: '0 0 4px' }}
          >
            MORER
          </Heading>
          <Hr style={{ borderColor: '#e5e7eb', margin: '16px 0' }} />

          <Heading
            as="h2"
            style={{ fontSize: '18px', fontWeight: '600', margin: '0 0 8px' }}
          >
            ¡Gracias por tu pedido!
          </Heading>
          <Text style={{ margin: '0 0 16px', color: '#374151' }}>
            Tu pago ha sido confirmado y tu pedido{' '}
            <strong>{orderNumber}</strong> está en proceso.
          </Text>

          <Hr style={{ borderColor: '#e5e7eb', margin: '16px 0' }} />

          <Heading
            as="h3"
            style={{
              fontSize: '11px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#6b7280',
              margin: '0 0 12px',
            }}
          >
            Detalle del pedido
          </Heading>

          {items.map((item, index) => (
            <Section key={index} style={{ marginBottom: '12px' }}>
              <Text style={{ margin: '0 0 2px', fontWeight: '600', fontSize: '14px' }}>
                {item.productName}
                <span style={{ fontWeight: '400', color: '#6b7280' }}> — {item.variantSize}</span>
              </Text>
              <Text style={{ margin: 0, fontSize: '13px', color: '#4b5563' }}>
                Cant. {item.quantity} · Precio unitario {formatPrice(item.priceInCents, currency)}
              </Text>
            </Section>
          ))}

          <Hr style={{ borderColor: '#e5e7eb', margin: '16px 0' }} />

          {/* Shipping method (Phase 11F) */}
          <Section style={{ marginBottom: '12px' }}>
            <Heading
              as="h3"
              style={{
                fontSize: '11px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#6b7280',
                margin: '0 0 8px',
              }}
            >
              Método de envío
            </Heading>
            {shippingMethod ? (
              <>
                <Text style={{ margin: '0 0 2px', fontSize: '14px', fontWeight: '600' }}>
                  {shippingMethod.name}
                </Text>
                <Text style={{ margin: '0 0 2px', fontSize: '13px', color: '#4b5563' }}>
                  {shippingMethod.description}
                </Text>
                <Text style={{ margin: 0, fontSize: '13px', color: '#374151' }}>{shippingLabel}</Text>
              </>
            ) : (
              <Text style={{ margin: 0, fontSize: '13px', color: '#9ca3af' }}>
                {SHIPPING_METHOD_UNAVAILABLE}
              </Text>
            )}
          </Section>

          {/* Money breakdown (Phase 11F) */}
          <Section style={{ marginBottom: '4px' }}>
            <Text style={{ margin: '0 0 4px', fontSize: '13px', color: '#374151' }}>
              Subtotal: {formatPrice(subtotal, currency)}
            </Text>
            <Text style={{ margin: '0 0 4px', fontSize: '13px', color: '#374151' }}>
              Envío: {shippingLabel}
            </Text>
            <Text style={{ margin: '0 0 8px', fontSize: '13px', color: '#374151' }}>
              Impuestos: {formatPrice(tax, currency)}
            </Text>
            <Text style={{ fontSize: '16px', fontWeight: '700', margin: 0 }}>
              Total: {formatPrice(totalInCents, currency)}
            </Text>
          </Section>

          <Hr style={{ borderColor: '#e5e7eb', margin: '24px 0 16px' }} />

          <AddressBlock title="Dirección de envío" address={shippingAddress} />
          <AddressBlock title="Dirección de facturación" address={billingAddress} />

          <Hr style={{ borderColor: '#e5e7eb', margin: '16px 0' }} />

          <Text style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
            Si tienes alguna pregunta sobre tu pedido, puedes consultarlo en morer.com.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
