import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from '@react-email/components';
import * as React from 'react';

export const SUBJECT = 'Confirma tu nuevo correo de MORER';

export interface ConfirmEmailChangeData {
  confirmUrl: string;
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

const ctaLink: React.CSSProperties = {
  display: 'inline-block',
  marginTop: '8px',
  padding: '12px 24px',
  backgroundColor: '#1a1a1a',
  color: '#ffffff',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: '600',
  letterSpacing: '0.04em',
};

export function ConfirmEmailChangeEmail({ confirmUrl }: ConfirmEmailChangeData) {
  return (
    <Html lang="es">
      <Head />
      <Preview>Confirma tu nuevo correo de MORER</Preview>
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
            Confirma tu nuevo correo
          </Heading>
          <Text style={{ margin: '0 0 16px', color: '#374151' }}>
            Se ha solicitado usar esta dirección de correo para una cuenta de
            MORER. Confirma que es tuya para completar el cambio.
          </Text>

          <Link href={confirmUrl} style={ctaLink}>
            Confirmar nuevo correo
          </Link>

          <Hr style={{ borderColor: '#e5e7eb', margin: '32px 0 16px' }} />

          <Text style={{ margin: '0 0 12px', fontSize: '13px', color: '#6b7280' }}>
            Este enlace caduca en 60 minutos.
          </Text>
          <Text style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>
            Si no solicitaste este cambio, puedes ignorar este correo de forma
            segura.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
