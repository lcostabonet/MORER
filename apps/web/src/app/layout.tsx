import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MORER',
  description: 'Boardshorts made for the whole summer day.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
