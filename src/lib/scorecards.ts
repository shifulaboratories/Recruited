/**
 * Scorecards and offers: the shapes and the small rules, shared by the data
 * layer, the tools and the page. Pure module.
 */
import { z } from "zod";

export const RECOMMENDATIONS = ["STRONG_YES", "YES", "NO", "STRONG_NO"] as const;
export type RecommendationName = (typeof RECOMMENDATIONS)[number];

export const RECOMMENDATION_LABEL: Record<RecommendationName, string> = {
  STRONG_YES: "Strong yes",
  YES: "Yes",
  NO: "No",
  STRONG_NO: "Strong no",
};

/** 1 = well below the bar, 2 = below, 3 = meets, 4 = above. */
export const RatingSchema = z.object({
  criterion: z.string().trim().min(1).max(120),
  score: z.number().int().min(1).max(4),
  note: z.string().trim().max(1000).default(""),
});
export const RatingsSchema = z.array(RatingSchema).max(20);
export type ScorecardRating = z.infer<typeof RatingSchema>;

export function readRatings(json: unknown): ScorecardRating[] {
  const r = RatingsSchema.safeParse(json);
  return r.success ? r.data : [];
}

/**
 * Where the panel stands on one applicant: how many said yes and no, and
 * whether anyone said strong no, which a person should always read before
 * deciding. Not a decision; nothing acts on it.
 */
export function panelView(cards: { recommendation: RecommendationName }[]) {
  const yes = cards.filter((c) => c.recommendation === "YES" || c.recommendation === "STRONG_YES").length;
  const no = cards.length - yes;
  return {
    scorecards: cards.length,
    yes,
    no,
    strongNo: cards.some((c) => c.recommendation === "STRONG_NO"),
    split: yes > 0 && no > 0,
  };
}

export const INTERVIEW_FORMATS = ["video", "phone", "in_person"] as const;
export const OFFER_STATUSES = ["DRAFT", "EXTENDED", "ACCEPTED", "DECLINED", "WITHDRAWN"] as const;
export const PAY_PERIODS = ["hour", "month", "year"] as const;

export function formatOfferPay(o: { payAmount: number | null; payCurrency: string; payPeriod: string }) {
  return o.payAmount == null ? "" : `${o.payCurrency} ${o.payAmount.toLocaleString("en-US")} per ${o.payPeriod}`;
}

/** The terms that differ between two versions of an offer, for "what changed". */
export const OFFER_TERMS = ["title", "payAmount", "payCurrency", "payPeriod", "startDate", "hours", "terms", "respondBy"] as const;
export const OFFER_TERM_LABEL: Record<(typeof OFFER_TERMS)[number], string> = {
  title: "title",
  payAmount: "pay",
  payCurrency: "currency",
  payPeriod: "pay period",
  startDate: "start date",
  hours: "hours",
  terms: "other terms",
  respondBy: "answer-by date",
};
export function offerChanges(prev: Record<string, unknown> | null, next: Record<string, unknown>): string[] {
  if (!prev) return [];
  const v = (x: unknown) => (x instanceof Date ? x.toISOString().slice(0, 10) : x ?? null);
  return OFFER_TERMS.filter((k) => v(prev[k]) !== v(next[k]));
}
