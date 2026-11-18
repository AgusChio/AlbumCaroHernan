export const WEDDING = {
  couple: "Carolina & Hernán",
  monogram: "C · H",
  date: "Sábado 28 de noviembre de 2026",
  invitation: "Gracias por acompañarnos. Compartí acá las fotos que sacaste en el civil, en la misa y en la fiesta.",
};

export const ALBUMS = [
  { id: "civil", label: "Civil", phrase: "el civil" },
  { id: "misa", label: "Misa", phrase: "la misa" },
  { id: "fiesta", label: "Fiesta", phrase: "la fiesta" },
] as const;

export type Album = (typeof ALBUMS)[number]["id"];
