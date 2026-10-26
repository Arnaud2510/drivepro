export type PlanAccent = "orange" | "blue";
export type PlanIcon = "calendar" | "infinity";

export interface Plan {
  id: string;
  /** Libellé du badge, ex. « SEMAINE ». */
  label: string;
  /** Volume ou description principale, ex. « 5Go ». */
  title: string;
  /** Ligne secondaire facultative, ex. « Valable 7 jours ». */
  detail?: string;
  /** Prix en francs CFA. */
  priceFcfa: number;
  accent: PlanAccent;
  icon: PlanIcon;
}

export const PLANS: readonly Plan[] = [
  {
    id: "semaine",
    label: "SEMAINE",
    title: "5Go",
    detail: "Valable 7 jours",
    priceFcfa: 2500,
    accent: "orange",
    icon: "calendar",
  },
  {
    id: "mois",
    label: "MOIS",
    title: "10Go",
    detail: "Valable 30 jours",
    priceFcfa: 5000,
    accent: "blue",
    icon: "calendar",
  },
  {
    id: "illimite",
    label: "ILLIMITÉ",
    title: "Hotspot illimité",
    detail: "Valable 30 jours",
    priceFcfa: 12000,
    accent: "orange",
    icon: "infinity",
  },
];
