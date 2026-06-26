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

export const SUBJECT = 'Restablece tu contraseña de MORER';

export interface PasswordResetData {
  firstName?: string | null;
  resetUrl: string;
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

export function PasswordResetEmail({ firstName, resetUrl }: PasswordResetData) {
  const greeting = firstName ? `Hola, ${firstName}` : 'Hola';

  return (
    <Html lang="es">
      <Head />
      <Preview>Restablece tu contraseña de MORER</Preview>
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
            {greeting}
          </Heading>
          <Text style={{ margin: '0 0 16px', color: '#374151' }}>
            Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en MORER.
          </Text>

          <Link href={resetUrl} style={ctaLink}>
            Restablecer contraseña
          </Link>

          <Hr style={{ borderColor: '#e5e7eb', margin: '32px 0 16px' }} />

          <Text style={{ margin: '0 0 12px', fontSize: '13px', color: '#6b7280' }}>
            Este enlace caduca en 30 minutos.
          </Text>
          <Text style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>
            Si no solicitaste este cambio, puedes ignorar este correo de forma segura.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
