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
}: OrderConfirmationData) {
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

          <Text style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 4px' }}>
            Total: {formatPrice(totalInCents, currency)}
          </Text>

          <Hr style={{ borderColor: '#e5e7eb', margin: '24px 0 16px' }} />

          <Text style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
            Si tienes alguna pregunta sobre tu pedido, puedes consultarlo en morer.com.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
