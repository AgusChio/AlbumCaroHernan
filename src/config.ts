export const WEDDING = {
  couple: "Carolina & Hernán",
  monogram: "C · H",
  date: "Sábado 28 de noviembre de 2026",
  invitation: "Gracias por acompañarnos. Compartí acá las fotos que sacaste en la iglesia y en la fiesta.",
};

export const ALBUMS = [
  { id: "iglesia", label: "Iglesia" },
  { id: "fiesta", label: "Fiesta" },
] as const;

export type Album = (typeof ALBUMS)[number]["id"];
