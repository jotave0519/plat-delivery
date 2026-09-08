import type { ReviewSentiment } from "@/generated/prisma";

/**
 * Whether a review is handled automatically or escalated to the owner is
 * decided by this — a pure function of the star rating Google already gives
 * us — never by the AI. Same principle as src/server/orders/pricing.ts
 * never letting the AI decide a price: a decision with a real public
 * consequence (publishing something on the business's behalf) always comes
 * from an objective, deterministic source, not a subjective model judgment.
 * The AI's only role in this agent is generating the response TEXT
 * (src/server/integrations/anthropic/review-writer.ts).
 */
export function sentimentFromRating(rating: number): ReviewSentiment {
  if (rating >= 4) return "POSITIVA";
  if (rating === 3) return "NEUTRA";
  return "NEGATIVA";
}
