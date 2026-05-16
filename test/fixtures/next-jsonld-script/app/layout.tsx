import Script from "next/script";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Script id="org-schema" type="application/ld+json">
          {JSON.stringify({ "@type": "Organization" })}
        </Script>
        {children}
      </body>
    </html>
  );
}
