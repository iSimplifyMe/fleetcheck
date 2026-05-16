export default function Page() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({ "@type": "BlogPosting", headline: "Roofing" }),
        }}
      />
      <h1>Roofing</h1>
    </main>
  );
}
