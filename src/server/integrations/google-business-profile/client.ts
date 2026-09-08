import "server-only";

import { env, isGoogleBusinessProfileConfigured } from "@/lib/env";

/**
 * Thin, typed wrapper around the Google Business Profile API (reviews.list /
 * reviews.updateReply, v4 — confirmed still active, not deprecated, as of
 * this writing) — same "one isolated place to talk to the external API
 * from" pattern as evolution/client.ts and elevenlabs/client.ts.
 *
 * A single Google account (the agency's own, added as a manager on every
 * client's Business Profile) authenticates for every tenant — there is no
 * per-tenant OAuth consent flow. GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID is that
 * one account; each tenant is selected by its own locationId
 * (Restaurant.reviewAgentGoogleLocationId).
 *
 * NOT yet verified against a real approved account (Google's Business
 * Profile API access is gated behind an approval request — see the plan
 * notes) — implemented from current public documentation, same "best
 * effort, adjust here only once tested" discipline already used for
 * Evolution API's sendTextMessage before it was confirmed.
 */

export class GoogleBusinessProfileNotConfiguredError extends Error {
  constructor() {
    super(
      "Agente de avaliações do Google não configurado — defina GOOGLE_BUSINESS_PROFILE_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN/ACCOUNT_ID.",
    );
    this.name = "GoogleBusinessProfileNotConfiguredError";
  }
}

// ---------- OAuth token exchange ----------
//
// Cached in module memory (not the database) — this is one set of
// platform-wide credentials, not a per-tenant token, so there's nothing to
// persist beyond the process's own lifetime.
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (!isGoogleBusinessProfileConfigured) throw new GoogleBusinessProfileNotConfiguredError();

  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_BUSINESS_PROFILE_CLIENT_ID!,
      client_secret: env.GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET!,
      refresh_token: env.GOOGLE_BUSINESS_PROFILE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Falha ao renovar token do Google (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedAccessToken.token;
}

async function googleBusinessProfileRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await getAccessToken();
  const res = await fetch(`https://mybusiness.googleapis.com/v4${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Business Profile API respondeu ${res.status} em ${path}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export type GoogleReview = {
  reviewId: string;
  reviewer: { displayName: string };
  starRating: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE";
  comment?: string;
  createTime: string;
  reviewReply?: { comment: string };
};

const STAR_RATING_TO_NUMBER: Record<GoogleReview["starRating"], number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

export function starRatingToNumber(starRating: GoogleReview["starRating"]): number {
  return STAR_RATING_TO_NUMBER[starRating];
}

/** All reviews for a location — the caller filters out ones already seen (by googleReviewId), same as the doc specifies. */
export async function listReviews(locationId: string): Promise<GoogleReview[]> {
  const accountId = env.GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID!;
  const result = await googleBusinessProfileRequest<{ reviews?: GoogleReview[] }>(
    `/accounts/${accountId}/locations/${locationId}/reviews`,
  );
  return result.reviews ?? [];
}

/** Publishes (or replaces) the reply to a review — the only call in this file that has a real, public, one-way effect. */
export async function replyToReview(locationId: string, reviewId: string, comment: string): Promise<void> {
  const accountId = env.GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID!;
  await googleBusinessProfileRequest<unknown>(`/accounts/${accountId}/locations/${locationId}/reviews/${reviewId}/reply`, {
    method: "PUT",
    body: JSON.stringify({ comment }),
  });
}
