import {
  Boxes,
  Clock3,
  Eye,
  Headphones,
  PackageCheck,
  Plane,
  Scale,
  ShieldCheck,
  Ship,
  Store,
  Truck,
  WalletCards
} from "lucide-react";

export const serviceOfferings = [
  {
    title: "Fret aérien",
    description: "Expédition rapide de vos colis entre le Bénin et la RDC.",
    icon: Plane
  },
  {
    title: "Fret routier",
    description: "Acheminement local et régional selon les besoins logistiques.",
    icon: Truck
  },
  {
    title: "Groupage",
    description: "Solution économique pour regrouper plusieurs colis.",
    icon: Boxes
  },
  {
    title: "Transport maritime",
    description: "Solution adaptée aux marchandises volumineuses.",
    icon: Ship
  },
  {
    title: "Livraison express",
    description: "Service prioritaire pour les colis urgents.",
    icon: Clock3
  },
  {
    title: "Stockage",
    description: "Entreposage sécurisé avant expédition ou livraison.",
    icon: Store
  }
] as const;

export const serviceAdvantages = [
  { title: "Sécurité", description: "Colis suivis, contrôlés et manipulés avec rigueur.", icon: ShieldCheck },
  { title: "Rapidité", description: "Délais optimisés selon le mode de transport choisi.", icon: Clock3 },
  { title: "Suivi", description: "Informations claires sur les étapes importantes.", icon: Eye },
  { title: "Assistance", description: "Accompagnement humain avant, pendant et après l’expédition.", icon: Headphones },
  { title: "Tarifs transparents", description: "Prix lisibles et expliqués avant validation.", icon: WalletCards },
  { title: "Professionnalisme", description: "Processus sérieux pour particuliers et entreprises.", icon: Scale }
] as const;

export const serviceStats = [
  { label: "services logistiques", value: "6", icon: PackageCheck },
  { label: "axes Bénin - RDC", value: "25+", icon: Plane },
  { label: "support opérationnel", value: "7j/7", icon: Headphones }
] as const;
