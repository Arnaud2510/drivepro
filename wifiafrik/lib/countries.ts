/**
 * Pays pris en charge par CinetPay dont la devise est le franc CFA
 * (les prix WifiAfrik sont exprimés en FCFA ; XOF et XAF ont la même parité).
 * Un compte marchand CinetPay = un pays : seuls les pays configurés côté serveur sont proposés.
 */
export type CountryCode = "CI" | "SN" | "ML" | "BF" | "TG" | "BJ" | "NE" | "CM" | "TD" | "CG" | "CF" | "GA" | "GQ";
export type FcfaCurrency = "XOF" | "XAF";

export interface Country {
  code: CountryCode;
  name: string;
  callingCode: string;
  currency: FcfaCurrency;
}

export const COUNTRIES: readonly Country[] = [
  { code: "CI", name: "Côte d'Ivoire", callingCode: "+225", currency: "XOF" },
  { code: "SN", name: "Sénégal", callingCode: "+221", currency: "XOF" },
  { code: "ML", name: "Mali", callingCode: "+223", currency: "XOF" },
  { code: "BF", name: "Burkina Faso", callingCode: "+226", currency: "XOF" },
  { code: "TG", name: "Togo", callingCode: "+228", currency: "XOF" },
  { code: "BJ", name: "Bénin", callingCode: "+229", currency: "XOF" },
  { code: "NE", name: "Niger", callingCode: "+227", currency: "XOF" },
  { code: "CM", name: "Cameroun", callingCode: "+237", currency: "XAF" },
  { code: "TD", name: "Tchad", callingCode: "+235", currency: "XAF" },
  { code: "CG", name: "Congo", callingCode: "+242", currency: "XAF" },
  { code: "CF", name: "Centrafrique", callingCode: "+236", currency: "XAF" },
  { code: "GA", name: "Gabon", callingCode: "+241", currency: "XAF" },
  { code: "GQ", name: "Guinée équatoriale", callingCode: "+240", currency: "XAF" },
];

export function findCountry(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}
