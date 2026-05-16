export default function Page() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({ "@type": "BlogPosting", headline: "My Post" }),
        }}
      />
      <h1>My Post</h1>
    </main>
  );
}
