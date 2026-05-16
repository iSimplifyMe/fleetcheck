export default function Page() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({ "@type": "BlogPosting", headline: "Widgets" }),
        }}
      />
      <h1>Widgets</h1>
    </main>
  );
}
