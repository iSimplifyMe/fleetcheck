// Baselined occurrence — the pre-existing, client-approved block.
export function generateDentistSchema() {
  return {
    "@type": "Dentist",
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "5.0",
      reviewCount: "651",
    },
  };
}
