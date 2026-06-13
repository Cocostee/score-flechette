import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Outfit } from "next/font/google";
import "./globals.css";

const display = Bebas_Neue({
  weight: "400",
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Outfit({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Oche — Compteur de Fléchettes",
  description:
    "Compteur de scores de fléchettes hors-ligne : 301/501, Cricket et Cut-Throat.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Oche",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#141109",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

/* Root layout wiring fonts, metadata and the PWA manifest. */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
