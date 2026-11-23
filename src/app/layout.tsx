import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GIX Workspace ｜ 株式会社GIX',
  description: '株式会社GIX の社内グループウェア',
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
