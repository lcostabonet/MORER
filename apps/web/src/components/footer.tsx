import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col md:flex-row justify-between gap-10">
          <div>
            <p className="text-lg font-bold tracking-[0.2em] text-stone-900">MORER</p>
            <p className="mt-2 text-sm text-stone-400">Boardshorts mediterráneos.</p>
          </div>
          <nav className="flex flex-col gap-3 text-sm">
            <Link href="/shop" className="text-stone-500 hover:text-stone-900 transition-colors">
              Tienda
            </Link>
            <Link href="/" className="text-stone-500 hover:text-stone-900 transition-colors">
              Inicio
            </Link>
          </nav>
        </div>
        <div className="mt-12 pt-6 border-t border-stone-100">
          <p className="text-xs text-stone-400">© 2025 MORER. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
