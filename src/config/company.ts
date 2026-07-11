export type CompanyAgency = {
  id: string;
  name: string;
  country: string;
  city: string;
  isHeadOffice?: boolean;
  addressLines: readonly string[];
  address: string;
  phones: readonly string[];
  whatsappNumbers: readonly string[];
  email: string;
  hours: string;
  openingHours: readonly {
    days: string;
    time: string;
  }[];
  directionsHref?: string;
};

export function toTelHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function toWhatsAppHref(phone: string) {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

const officialSocialMedia = {
  youtubeName: "Eben Ezer Business Chez Vanela",
  youtubeUrl: "https://youtube.com/@ebenezerbusinesschezmavanela?si=L0bMafSF0c1P-CGT",
  tiktokName: "Eben Ezer Business Chez Vanela",
  tiktokUrl: "https://www.tiktok.com/@vanela.shop6?_r=1&_t=ZS-97xCRkjIvGC"
} as const;

const officialWhatsApp = {
  primaryNumber: "+229 0197471459",
  primaryHref: "https://wa.me/2290197471459"
} as const;

export const companyConfig = {
  name: "Eben Ezer Business",
  slogan: "La Confiance En Mouvement",
  website: "https://ebenezerbusiness.com",
  domain: "ebenezerbusiness.com",
  email: "contact@ebenezerbusiness.com",
  hours: "Cotonou : du lundi au samedi, 09h00 - 19h30",
  whatsapp: officialWhatsApp,
  announcementTicker: {
    messages: [
      "🚚 Départ des expéditions de colis tous les mercredis et samedis matin.",
      "📦 Merci de bien vouloir apporter vos colis la veille pour faciliter le traitement et le départ.",
      "🇧🇯 Expédition Bénin → RDC en toute sécurité.",
      `📲 Contact WhatsApp : ${officialWhatsApp.primaryNumber}.`
    ]
  },
  socialMedia: officialSocialMedia,
  social: {
    youtube: {
      platform: "YouTube",
      channelName: officialSocialMedia.youtubeName,
      channelUrl: officialSocialMedia.youtubeUrl,
      liveUrl: ""
    },
    tiktok: {
      platform: "TikTok",
      channelName: officialSocialMedia.tiktokName,
      profileUrl: officialSocialMedia.tiktokUrl
    }
  },
  agencies: [
    {
      id: "cotonou",
      name: "Agence Cotonou",
      country: "Bénin",
      city: "Cotonou",
      isHeadOffice: true,
      addressLines: ["Scoa Gbeto", "Réf : BGFIBANK, Bâtiment Meuble AMANI"],
      address: "Scoa Gbeto. Réf : BGFIBANK, Bâtiment Meuble AMANI",
      phones: ["+229 0196158241", "+229 0197471459"],
      whatsappNumbers: ["+229 0197471459", "+229 0196158241"],
      email: "contact@ebenezerbusiness.com",
      hours: "Du lundi au samedi : 09h00 - 19h30",
      openingHours: [{ days: "Du lundi au samedi", time: "09h00 – 19h30" }]
    },
    {
      id: "kinshasa",
      name: "Agence Kinshasa",
      country: "RDC",
      city: "Kinshasa",
      addressLines: [
        "Lemba Super",
        "Avenue BANGAMELO, 50/378",
        "Quartier Commercial",
        "Réf : derrière la salle de fête ELIANA"
      ],
      address:
        "Lemba Super. Avenue BANGAMELO, 50/378. Quartier Commercial. Réf : derrière la salle de fête ELIANA",
      phones: ["+243 993 192 588"],
      whatsappNumbers: ["+243 993 192 588"],
      email: "contact@ebenezerbusiness.com",
      hours: "Lundi-vendredi : 08h00 - 17h00. Samedi : 09h00 - 14h00",
      openingHours: [
        { days: "Du lundi au vendredi", time: "08h00 – 17h00" },
        { days: "Samedi", time: "09h00 – 14h00" }
      ]
    },
    {
      id: "lubumbashi",
      name: "Agence Lubumbashi",
      country: "RDC",
      city: "Lubumbashi",
      addressLines: [
        "30 Juin, en face de l’Assemblée provinciale de Lubumbashi",
        "Réf : le juste milieu du bâtiment en face du portail rouge bordeaux/blanc"
      ],
      address:
        "30 Juin, en face de l’Assemblée provinciale de Lubumbashi. Réf : le juste milieu du bâtiment en face du portail rouge bordeaux/blanc",
      phones: ["+243 896 762 452"],
      whatsappNumbers: ["+243 896 762 452"],
      email: "contact@ebenezerbusiness.com",
      hours: "Lundi-vendredi : 08h00 - 17h00. Samedi : 09h00 - 14h00",
      openingHours: [
        { days: "Du lundi au vendredi", time: "08h00 – 17h00" },
        { days: "Samedi", time: "09h00 – 14h00" }
      ]
    },
    {
      id: "kolwezi",
      name: "Agence Kolwezi",
      country: "RDC",
      city: "Kolwezi",
      addressLines: [
        "Commune de Dilala",
        "Quartier Dilungu",
        "Avenue des Aviateurs, Numéro 2414B"
      ],
      address: "Commune de Dilala. Quartier Dilungu. Avenue des Aviateurs, Numéro 2414B",
      phones: ["+243 991 361 197"],
      whatsappNumbers: ["+243 991 361 197"],
      email: "contact@ebenezerbusiness.com",
      hours: "Lundi-vendredi : 08h00 - 17h00. Samedi : 09h00 - 14h00",
      openingHours: [
        { days: "Du lundi au vendredi", time: "08h00 – 17h00" },
        { days: "Samedi", time: "09h00 – 14h00" }
      ]
    }
  ] satisfies readonly CompanyAgency[]
} as const;

export const companyInfo = {
  name: companyConfig.name,
  slogan: companyConfig.slogan,
  website: companyConfig.website,
  domain: companyConfig.domain,
  phones: companyConfig.agencies[0].phones,
  primaryWhatsappNumber: companyConfig.whatsapp.primaryNumber,
  primaryWhatsappHref: companyConfig.whatsapp.primaryHref,
  whatsappNumbers: companyConfig.agencies[0].whatsappNumbers,
  email: companyConfig.email,
  hours: companyConfig.hours
} as const;

export const companyAgencies = companyConfig.agencies;

export const primaryAgencies = companyAgencies.slice(0, 3);

export const companySocialMedia = companyConfig.socialMedia;

export const companyTickerMessages = companyConfig.announcementTicker.messages;
