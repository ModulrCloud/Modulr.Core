import type { Metadata } from "next";
import { Inter, Quantico } from "next/font/google";

import { ClientShell } from "@/components/shell/ClientShell";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const quantico = Quantico({
  weight: ["400", "700"],
  variable: "--font-quantico",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Modulr — Core shell",
  description: "Modulr.Core shell: stage 1 UI for routing, settings, and theme.",
  /** Static /favicon.ico from public/ avoids App Router icon pipeline decode rejections (Event). */
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${quantico.variable} antialiased`}
      >
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
