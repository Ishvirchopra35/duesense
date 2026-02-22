import type { Metadata } from "next";
import { Space_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DueSense",
  description: "Student deadline tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${spaceMono.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="duesense-theme">
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
