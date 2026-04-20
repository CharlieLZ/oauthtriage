import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'OAuthTriage',
  description: 'Local-first Google Workspace OAuth grant triage tool'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
