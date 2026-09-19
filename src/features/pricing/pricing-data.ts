export type PricingDestination = {
  city: string;
  pricePerKg: number;
  popular?: boolean;
};

export const pricingDestinations: PricingDestination[] = [
  { city: "Kinshasa", pricePerKg: 9, popular: true },
  { city: "Lubumbashi", pricePerKg: 10, popular: true },
  { city: "Kolwezi", pricePerKg: 11, popular: true },
  { city: "Kisangani", pricePerKg: 12 },
  { city: "Goma", pricePerKg: 16 },
  { city: "Bukavu", pricePerKg: 17 },
  { city: "Mbuji-Mayi", pricePerKg: 12 },
  { city: "Kananga", pricePerKg: 12 },
  { city: "Kalemie", pricePerKg: 14 },
  { city: "Bunia", pricePerKg: 14 },
  { city: "Beni", pricePerKg: 14 },
  { city: "Butembo", pricePerKg: 14 },
  { city: "Isiro", pricePerKg: 14 },
  { city: "Durba", pricePerKg: 17 },
  { city: "Aru", pricePerKg: 17 },
  { city: "Kindu", pricePerKg: 13 }
];

export const popularPricingDestinations = pricingDestinations.filter(
  (destination) => destination.popular
);
