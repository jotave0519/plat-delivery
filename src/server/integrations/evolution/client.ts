import "server-only";

import { env, isEvolutionApiConfigured } from "@/lib/env";

/**
 * Thin, typed wrapper around the Evolution API (self-hosted WhatsApp
 * gateway). Used by src/server/actions/atendimento.ts (connect/disconnect
 * flow) — a single, isolated place to talk to Evolution API from, instead of
 * scattering fetch calls.
 *
 * createInstance/fetchConnectionState/fetchQrCode/deleteInstance shapes are
 * confirmed against Evolution API v2's public docs
 * (docs.evolutionfoundation.com.br). sendTextMessage is NOT yet confirmed
 * empirically (the docs disagree with common knowledge of v2's actual body
 * shape) — it isn't called anywhere yet, so verify it against a real
 * connected instance before using it in Fase 2 (persistência de conversas).
 */

export class EvolutionApiNotConfiguredError extends Error {
  constructor() {
    super("Evolution API não configurada — defina EVOLUTION_API_URL e EVOLUTION_API_KEY.");
    this.name = "EvolutionApiNotConfiguredError";
  }
}

async function evolutionRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isEvolutionApiConfigured) throw new EvolutionApiNotConfiguredError();

  const res = await fetch(`${env.EVOLUTION_API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: env.EVOLUTION_API_KEY!,
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Evolution API respondeu ${res.status} em ${path}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export type EvolutionConnectionState = "open" | "connecting" | "close";

export type CreateInstanceResult = {
  instance: { instanceName: string };
  qrcode?: { base64?: string; pairingCode?: string | null };
};

/** Creates one WhatsApp instance for a restaurant, wired to our webhook. */
export function createInstance(instanceName: string, webhookUrl: string) {
  return evolutionRequest<CreateInstanceResult>("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: {
        enabled: true,
        url: webhookUrl,
        events: ["QRCODE_UPDATED", "CONNECTION_UPDATE"],
      },
    }),
  });
}

export function fetchConnectionState(instanceName: string) {
  return evolutionRequest<{ instance: { state: EvolutionConnectionState } }>(
    `/instance/connectionState/${instanceName}`,
  );
}

/** Returns a base64 QR code to render while the instance is CONNECTING. */
export function fetchQrCode(instanceName: string) {
  return evolutionRequest<{ base64?: string }>(`/instance/connect/${instanceName}`);
}

export function sendTextMessage(instanceName: string, to: string, text: string) {
  return evolutionRequest<{ key: { id: string } }>(`/message/sendText/${instanceName}`, {
    method: "POST",
    body: JSON.stringify({ number: to, text }),
  });
}

export function deleteInstance(instanceName: string) {
  return evolutionRequest<unknown>(`/instance/delete/${instanceName}`, { method: "DELETE" });
}
