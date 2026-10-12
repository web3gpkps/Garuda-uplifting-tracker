import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { APP_NAME, APP_TAGLINE } from "@/lib/app-info";
import "./globals.css";

// Plus Jakarta Sans (DESIGN.md Typography): made for Jakarta's city identity, renders
// Bahasa Indonesia well, has tabular figures for score/BMI columns, and its open
// geometric forms sit quietly next to both partner wordmarks.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  applicationName: APP_NAME,
  description: `${APP_TAGLINE}. Pemantauan pasca Coaching Frontliner dan training IULS & RUST Garuda Indonesia untuk frontliner PT Gapura Angkasa.`,
  // Internal tool: nothing here should appear in search results.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f7f8fa",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body>{children}</body>
    </html>
  );
}
