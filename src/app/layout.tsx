import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Sistema de Gestión de Inventarios | Banco de Alimentos Ibagué",
  description:
    "Sistema de gestión, trazabilidad y conciliación de inventarios para el Banco Arquidiocesano de Alimentos de Ibagué",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      {/*
        `suppressHydrationWarning` evita que React marque error de
        hidratación cuando una extensión del navegador (por ejemplo
        cz-shortcut, que añade `cz-shortcut-listen`) inyecta atributos
        en el <body> antes de que cargue React. El atributo lo agrega la
        extensión, no la aplicación.
      */}
      <body
        suppressHydrationWarning
        className={`${inter.variable} font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
