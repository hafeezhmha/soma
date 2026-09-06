import type { Metadata } from 'next';
import './globals.css';
import './divya.css';

export const metadata: Metadata = {
  title: 'SOMA — notice what is happening',
  description: 'A quiet body-aware reflection companion.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
