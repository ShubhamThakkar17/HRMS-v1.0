import type { Metadata, Viewport } from 'next';
import './globals.css';
import { RegisterSW } from '@/components/register-sw';

export const metadata: Metadata = {
  title: { default: 'Silver Touch HRMS', template: '%s · Silver Touch HRMS' },
  description: 'People, attendance, leave and expenses for Silver Touch.',
  applicationName: 'Silver Touch HRMS',
  appleWebApp: { capable: true, title: 'ST HRMS', statusBarStyle: 'default' },
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};

export const viewport: Viewport = { themeColor: '#0e5e4a', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
