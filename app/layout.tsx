import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import AuthGate from "@/components/AuthGate";
import ToastProvider from "@/components/ToastProvider";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TC Assistant",
  description: "Transaction coordination, with less busywork.",
};

export const viewport: Viewport = { themeColor: "#4c0519" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ToastProvider>
          <AuthGate>{children}</AuthGate>
        </ToastProvider>
      </body>
    </html>
  );
}
