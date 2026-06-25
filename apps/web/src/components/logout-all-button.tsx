'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LogoutAllButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!window.confirm('Cerrar sesión en todos los dispositivos. ¿Continuar?')) return;
    setLoading(true);
    try {
      await fetch('/api/auth/logout-all', { method: 'POST' });
    } finally {
      router.replace('/');
      router.refresh();
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={loading}>
      {loading ? 'Cerrando sesión...' : 'Cerrar sesión en todos los dispositivos'}
    </button>
  );
}
