'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/');
      router.refresh();
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className={`text-xs font-medium tracking-[0.15em] uppercase transition-colors ${
        loading
          ? 'text-stone-400 cursor-not-allowed'
          : 'text-stone-500 hover:text-stone-900 cursor-pointer'
      }`}
    >
      {loading ? 'Cerrando sesión...' : 'Cerrar sesión'}
    </button>
  );
}
