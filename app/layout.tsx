import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pi App",
  description: "Pi Coding Agent Interface",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/app-icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/app-icon.png", sizes: "512x512", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k="pi-theme-mode";var legacy="pi-theme";var mode=localStorage.getItem(k);if(mode!=="system"&&mode!=="light"&&mode!=="dark"){var old=localStorage.getItem(legacy);mode=(old==="light"||old==="dark")?old:"system";if(old==="light"||old==="dark"){localStorage.setItem(k,mode);localStorage.removeItem(legacy);}}var resolved=mode==="dark"||mode==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.classList.toggle("dark",resolved==="dark");document.documentElement.dataset.themeMode=mode;document.documentElement.dataset.theme=resolved;document.documentElement.style.colorScheme=resolved;}catch(e){}})();`,
          }}
        />
      </head>
      <body style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
        {children}
      </body>
    </html>
  );
}
