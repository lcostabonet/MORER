import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from '@react-email/components';
import * as React from 'react';

export const SUBJECT = 'El correo de tu cuenta MORER ha cambiado';

export interface EmailChangedNoticeData {
  // A partially masked version of the new address (e.g. "n***@example.com").
  maskedNewEmail: string;
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

export function EmailChangedNoticeEmail({ maskedNewEmail }: EmailChangedNoticeData) {
  return (
    <Html lang="es">
      <Head />
      <Preview>El correo de tu cuenta MORER ha cambiado</Preview>
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
            El correo de acceso ha cambiado
          </Heading>
          <Text style={{ margin: '0 0 16px', color: '#374151' }}>
            El correo electrónico de acceso a tu cuenta de MORER se ha cambiado a{' '}
            <strong>{maskedNewEmail}</strong>.
          </Text>
          <Text style={{ margin: '0 0 16px', color: '#374151' }}>
            Por seguridad, se han cerrado todas las sesiones abiertas.
          </Text>

          <Hr style={{ borderColor: '#e5e7eb', margin: '32px 0 16px' }} />

          <Text style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>
            Si no reconoces este cambio, ponte en contacto con MORER lo antes
            posible.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
