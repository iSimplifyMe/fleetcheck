export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({ "@type": "Organization" }),
          }}
        />
        {children}
      </body>
    </html>
  );
}
