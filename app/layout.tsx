import './globals.css';

export const metadata = {
  title: 'Mindful Fractals',
  description: 'Calming fractal meditation with guided breathing.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-[#0b0f17] text-slate-100">{children}</body>
    </html>
  );
}
