import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Silver Touch HRMS',
    short_name: 'ST HRMS',
    description: 'Punch in, apply for leave and claim expenses.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f2f5f4',
    theme_color: '#0e5e4a',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
