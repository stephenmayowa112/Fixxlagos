import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Inter } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700'],
  display: 'swap',
  variable: '--font-space-grotesk',
});

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '600'],
  display: 'swap',
  variable: '--font-inter',
});

export const viewport: Viewport = {
  themeColor: '#14211E',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Fix Lagos — Report it. Route it. Track it until it’s fixed.',
  description:
    'Mobile-first civic infrastructure reporting PWA for Lagos residents. Report broken roads, street lights, and drainage; route to responsible agencies; and verify repairs.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Fix Lagos',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    title: 'Fix Lagos — Report it. Route it. Track it until it’s fixed.',
    description:
      'Report broken roads, street lights, and drainage in Lagos with a geotagged photo. Track public status trails and confirm repairs.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fix Lagos — Civic Infrastructure Reporting',
    description:
      'Report broken roads, street lights, and drainage in Lagos. Route to responsible agencies and verify repairs.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-[#F7F5EF] text-[#14211E] antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
