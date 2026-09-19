import {
  Boxes,
  Clock3,
  Eye,
  Headphones,
  MapPin,
  PackageCheck,
  Plane,
  Scale,
  ShieldCheck,
  Ship,
  Store,
  Truck,
  Users
} from "lucide-react";

export const navItems = [
  { label: "Accueil", href: "/#accueil" },
  { label: "Services", href: "/#services" },
  { label: "Tarifs", href: "/tarifs" },
  { label: "Destinations", href: "/#destinations" },
  { label: "Suivi de colis", href: "/suivi-de-colis" },
  { label: "A propos", href: "/#a-propos" },
  { label: "Contact", href: "/contact" }
] as const;

export const services = [
  {
    title: "Fret aerien",
    description: "Acheminement rapide des colis urgents entre le Benin et la RDC.",
    icon: Plane
  },
  {
    title: "Fret routier",
    description: "Connexion terrestre fiable pour les flux regionaux et la distribution locale.",
    icon: Truck
  },
  {
    title: "Groupage",
    description: "Mutualisation intelligente des volumes pour optimiser les couts d'expedition.",
    icon: Boxes
  },
  {
    title: "Transport maritime",
    description: "Solutions conteneurisees pour les marchandises lourdes et les volumes importants.",
    icon: Ship
  },
  {
    title: "Livraison express",
    description: "Traitement prioritaire, suivi renforce et livraison acceleree.",
    icon: Clock3
  },
  {
    title: "Stockage",
    description: "Espaces partenaires pour securiser vos colis avant expedition ou distribution.",
    icon: Store
  }
] as const;

export const destinations = [
  "Kinshasa",
  "Lubumbashi",
  "Kolwezi",
  "Goma",
  "Bukavu",
  "Kisangani",
  "Kananga",
  "Mbuji-Mayi"
] as const;

export const advantages = [
  {
    title: "Securite",
    description: "Processus controles, colis identifies et partenaires selectionnes.",
    icon: ShieldCheck
  },
  {
    title: "Rapidite",
    description: "Circuits optimises pour reduire les delais entre depot et livraison.",
    icon: Clock3
  },
  {
    title: "Professionnalisme",
    description: "Equipe orientee service, documentation claire et execution rigoureuse.",
    icon: Scale
  },
  {
    title: "Transparence",
    description: "Informations de suivi lisibles a chaque etape importante du trajet.",
    icon: Eye
  },
  {
    title: "Support client",
    description: "Assistance humaine pour accompagner expediteurs et destinataires.",
    icon: Headphones
  }
] as const;

export const stats = [
  { label: "colis transportes", value: "75 000+", icon: PackageCheck },
  { label: "agences partenaires", value: "15", icon: Users },
  { label: "destinations desservies", value: "25+", icon: MapPin },
  { label: "clients satisfaits", value: "10 000+", icon: ShieldCheck }
] as const;

export const footerLinks = [
  { label: "Services", href: "/#services" },
  { label: "Tarifs", href: "/tarifs" },
  { label: "Destinations", href: "/#destinations" },
  { label: "Suivi de colis", href: "/suivi-de-colis" },
  { label: "Contact", href: "/contact" }
] as const;
