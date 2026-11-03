import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Headings, rank numbers, totals, stickers.
const display = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz", "wdth"],
});

// Lists, tables, body text.
const text = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Listening Tracker",
  description: "My YouTube Music and YouTube listening history.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set from localStorage by the script before paint, so React
    // must accept the DOM's value instead of this default.
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${display.variable} ${text.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
