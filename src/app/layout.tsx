import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { RegisterSW } from '@/components/register-sw';

// Self-hosted at build time: one variable file, no request to Google at runtime.
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: { default: 'Silver Touch HRMS', template: '%s · Silver Touch HRMS' },
  description: 'People, attendance, leave and expenses for Silver Touch.',
  applicationName: 'Silver Touch HRMS',
  appleWebApp: { capable: true, title: 'ST HRMS', statusBarStyle: 'default' },
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};

export const viewport: Viewport = {
  themeColor: '#0d5c48',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={inter.variable}>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
