import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HarvestGo',
  description: 'Farm operations monitoring and compliance documentation for Kabutihan Farm',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-soil-50 text-leaf-900 antialiased">{children}</body>
    </html>
  );
}
