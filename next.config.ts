import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

// Strict security headers (Phase 12). 'unsafe-inline' scripts are needed for Next.js hydration
// without a nonce; 'wasm-unsafe-eval' lets TensorFlow.js (face-api) run its WASM backend.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://tile.openstreetmap.org",
  "media-src 'self' blob:",
  "connect-src 'self'",
  'frame-src https://www.openstreetmap.org',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['@prisma/client'],
  // Prisma's client engine loads a .wasm query compiler at runtime; make sure every function bundles it.
  outputFileTracingIncludes: {
    '/**': ['./node_modules/.prisma/client/*.wasm', './node_modules/.prisma/client/query_compiler_bg.js'],
  },
  experimental: {
    serverActions: { bodySizeLimit: '11mb' },
    optimizePackageImports: ['lucide-react'],
  },
  webpack(config) {
    // face-api ships a prebundled TensorFlow.js that trips a harmless "critical dependency" warning.
    config.ignoreWarnings = [...(config.ignoreWarnings ?? []), { module: /@vladmandic[\\/]face-api/ }];
    return config;
  },
  async headers() {
    return [
      {
        // Face models never change for a given build: cache them for a year.
        source: '/models/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
