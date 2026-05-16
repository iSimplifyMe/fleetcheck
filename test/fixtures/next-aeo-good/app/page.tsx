export default function Page() {
  return (
    <main>
      <h1>Roofing Services</h1>
      <AtomicAnswer question="What do we do?" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@type": "FAQPage" }) }}
      />
    </main>
  );
}
