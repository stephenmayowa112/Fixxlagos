import type { MetadataRoute } from 'next';
import { COLORS } from '../packages/tokens/src/index';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Fix Lagos — Civic Infrastructure Reporting',
    short_name: 'Fix Lagos',
    description:
      'Report broken roads, street lights and drainage in Lagos. Route to the responsible agency and track until fixed.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: COLORS.page,
    theme_color: COLORS.ink,
    icons: [
      {
        src: '/pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
