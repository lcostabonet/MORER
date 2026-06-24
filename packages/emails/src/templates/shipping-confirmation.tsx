import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

export interface ShippingConfirmationData {
  orderNumber: string;
  trackingNumber: string;
  trackingUrl?: string;
  items: Array<{
    productName: string;
    variantSize: string;
    quantity: number;
  }>;
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

export function ShippingConfirmationEmail({
  orderNumber,
  trackingNumber,
  trackingUrl,
  items,
}: ShippingConfirmationData) {
  return (
    <Html lang="es">
      <Head />
      <Preview>Tu pedido {orderNumber} está en camino — MORER</Preview>
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
            Tu pedido está en camino
          </Heading>
          <Text style={{ margin: '0 0 16px', color: '#374151' }}>
            Tu pedido <strong>{orderNumber}</strong> ha sido enviado y está de camino hacia ti.
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
            Información de seguimiento
          </Heading>

          <Text style={{ margin: '0 0 4px', fontSize: '14px' }}>
            Número de seguimiento:{' '}
            {trackingUrl ? (
              <Link
                href={trackingUrl}
                style={{ color: '#1a1a1a', fontWeight: '600', textDecoration: 'underline' }}
              >
                {trackingNumber}
              </Link>
            ) : (
              <strong>{trackingNumber}</strong>
            )}
          </Text>

          {trackingUrl && (
            <Text style={{ margin: '0 0 16px', fontSize: '13px', color: '#6b7280' }}>
              <Link href={trackingUrl} style={{ color: '#6b7280' }}>
                Haz clic aquí para rastrear tu envío
              </Link>
            </Text>
          )}

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
            Artículos enviados
          </Heading>

          {items.map((item, index) => (
            <Section key={index} style={{ marginBottom: '12px' }}>
              <Text style={{ margin: '0 0 2px', fontWeight: '600', fontSize: '14px' }}>
                {item.productName}
                <span style={{ fontWeight: '400', color: '#6b7280' }}> — {item.variantSize}</span>
              </Text>
              <Text style={{ margin: 0, fontSize: '13px', color: '#4b5563' }}>
                Cant. {item.quantity}
              </Text>
            </Section>
          ))}

          <Hr style={{ borderColor: '#e5e7eb', margin: '24px 0 16px' }} />

          <Text style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
            Si tienes alguna pregunta sobre tu envío, puedes consultarlo en morer.com.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
