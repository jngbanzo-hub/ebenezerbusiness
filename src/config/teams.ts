export type TeamSiteId = "cotonou" | "kinshasa" | "lubumbashi" | "kolwezi";

export type TeamImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

export type TeamMember = {
  name: string;
  role: string;
  description: string;
  image: TeamImage;
};

export type TeamSite = {
  id: TeamSiteId;
  city: string;
  title: string;
  address: string;
  description: string;
  image?: TeamImage;
  members: readonly TeamMember[];
  status: "available" | "coming-soon";
};

export const defaultTeamSiteId = "cotonou" satisfies TeamSiteId;

export const teamSites = [
  {
    id: "cotonou",
    city: "Cotonou",
    title: "Équipe de Cotonou",
    address: "Scoa Gbeto, référence BGFI / Meuble AMANI.",
    description:
      "L'équipe de Cotonou assure l'accueil, le traitement et la préparation des colis avant expédition.",
    image: {
      src: "/images/team/equipe-cotonou.jpeg",
      alt: "Equipe Eben Ezer Business de Cotonou",
      width: 1800,
      height: 1350
    },
    members: [
      {
        name: "Vanela Ilela Épouse NGBANZO",
        role: "Directrice Générale",
        description:
          "Elle assure la direction générale d'Eben Ezer Business et veille à la qualité du service, à l'organisation des opérations ainsi qu'à l'accompagnement des clients.",
        image: {
          src: "/images/team/directrice-generale.png",
          alt: "Vanela Ilela Épouse NGBANZO, Directrice Générale",
          width: 896,
          height: 1195
        }
      }
    ],
    status: "available"
  },
  {
    id: "kinshasa",
    city: "Kinshasa",
    title: "Équipe de Kinshasa",
    address: "Lemba Super, référence salle ELIANA.",
    description: "Présentation de l'équipe bientôt disponible.",
    members: [],
    status: "coming-soon"
  },
  {
    id: "lubumbashi",
    city: "Lubumbashi",
    title: "Équipe de Lubumbashi",
    address: "Avenue 30 Juin, face à l'Assemblée provinciale.",
    description: "Présentation de l'équipe bientôt disponible.",
    members: [],
    status: "coming-soon"
  },
  {
    id: "kolwezi",
    city: "Kolwezi",
    title: "Équipe de Kolwezi",
    address: "Dilala / Dilungu, Avenue des Aviateurs.",
    description: "Présentation de l'équipe bientôt disponible.",
    members: [],
    status: "coming-soon"
  }
] satisfies readonly TeamSite[];
