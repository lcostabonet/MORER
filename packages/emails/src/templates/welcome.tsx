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

export interface WelcomeData {
  firstName?: string | null;
  webUrl: string;
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

export function WelcomeEmail({ firstName, webUrl }: WelcomeData) {
  const greeting = firstName ? `Hola, ${firstName}` : 'Hola';

  return (
    <Html lang="es">
      <Head />
      <Preview>Bienvenido a MORER — tu cuenta ha sido creada</Preview>
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
            Tu cuenta en MORER ha sido creada correctamente.
          </Text>
          <Text style={{ margin: '0 0 24px', color: '#374151' }}>
            Ya puedes explorar nuestra colección y realizar tu primer pedido.
          </Text>

          <Link href={`${webUrl}/shop`} style={ctaLink}>
            Ir a la tienda
          </Link>

          <Hr style={{ borderColor: '#e5e7eb', margin: '32px 0 16px' }} />

          <Text style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
            Si tienes alguna pregunta, puedes consultarlo en{' '}
            <Link href={webUrl} style={{ color: '#9ca3af' }}>
              morer.com
            </Link>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
