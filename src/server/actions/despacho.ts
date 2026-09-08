"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { getTenant } from "@/lib/tenant";
import { notifyChamadoStatusChange, scheduleReviewRequestIfEnabled } from "@/server/actions/despacho-dispatch";
import type { ChamadoStatus } from "@/generated/prisma";

/**
 * Agente 3's client-facing Server Actions — the manual queue rescue path and
 * the settings/technician-roster CRUD used by the Configurações screen.
 * The dispatch/technician-reply/notification logic these call into lives in
 * src/server/actions/despacho-dispatch.ts (server-only, never imported by a
 * client component) — kept separate so importing anything from this file
 * into a "use client" component never drags the whole db/pg dependency
 * chain into the browser bundle.
 */

const MANAGER_ROLES = ["OWNER", "ADMIN"];

// ---------- manual queue actions (rescue path — the queue UI) ----------

export async function atribuirTecnicoManualmente(chamadoId: string, tecnicoId: string) {
  const tenant = await getTenant();
  const chamado = await db.chamado.findFirst({ where: { id: chamadoId, restaurantId: tenant.restaurantId } });
  if (!chamado) return { error: "Chamado não encontrado." };
  const tecnico = await db.tecnicoDisponibilidade.findFirst({ where: { id: tecnicoId, restaurantId: tenant.restaurantId } });
  if (!tecnico) return { error: "Técnico não encontrado." };

  await db.chamado.update({ where: { id: chamadoId }, data: { tecnicoId, status: "A_CAMINHO", ofertaExpiraEm: null } });
  await db.chamadoEvent.create({ data: { chamadoId, status: "A_CAMINHO" } });
  await notifyChamadoStatusChange(chamadoId);
  revalidatePath("/despacho");
}

export async function atualizarStatusChamadoManualmente(chamadoId: string, status: ChamadoStatus) {
  const tenant = await getTenant();
  const chamado = await db.chamado.findFirst({ where: { id: chamadoId, restaurantId: tenant.restaurantId } });
  if (!chamado) return { error: "Chamado não encontrado." };

  await db.chamado.update({ where: { id: chamadoId }, data: { status, ofertaExpiraEm: status === "OFERTADO" ? chamado.ofertaExpiraEm : null } });
  await db.chamadoEvent.create({ data: { chamadoId, status } });
  await notifyChamadoStatusChange(chamadoId);
  if (status === "CONCLUIDO") await scheduleReviewRequestIfEnabled(chamadoId);
  revalidatePath("/despacho");
}

export async function cancelarChamado(chamadoId: string, motivo?: string) {
  const tenant = await getTenant();
  const chamado = await db.chamado.findFirst({ where: { id: chamadoId, restaurantId: tenant.restaurantId } });
  if (!chamado) return { error: "Chamado não encontrado." };
  if (chamado.status === "CONCLUIDO" || chamado.status === "CANCELADO") return { error: "Este chamado já foi encerrado." };
  void motivo; // reserved for a future cancelReason field on Chamado, mirroring Order.cancelReason — not needed for the MVP UI, which only offers a plain cancel

  await db.chamado.update({ where: { id: chamadoId }, data: { status: "CANCELADO", ofertaExpiraEm: null } });
  await db.chamadoEvent.create({ data: { chamadoId, status: "CANCELADO" } });
  await notifyChamadoStatusChange(chamadoId);
  revalidatePath("/despacho");
}

// ---------- settings & technician roster ----------

export async function saveDespachoSettings(input: { despachoEscalationPhone?: string; despachoOfertaTimeoutMinutos?: number }) {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para configurar o despacho." };

  await db.restaurant.update({
    where: { id: tenant.restaurantId },
    data: {
      despachoEscalationPhone: input.despachoEscalationPhone?.trim() || null,
      despachoOfertaTimeoutMinutos: input.despachoOfertaTimeoutMinutos && input.despachoOfertaTimeoutMinutos > 0 ? input.despachoOfertaTimeoutMinutos : undefined,
    },
  });
  revalidatePath("/configuracoes");
  revalidatePath("/despacho");
}

export async function saveTecnico(input: { id?: string; nome: string; telefone: string; especialidades: string[]; regioes: string[]; disponivel: boolean }) {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para configurar técnicos." };
  if (!input.nome.trim() || !input.telefone.trim()) return { error: "Nome e telefone são obrigatórios." };

  const data = {
    nome: input.nome.trim(),
    telefone: input.telefone.replace(/\D/g, ""),
    especialidades: input.especialidades.map((e) => e.trim()).filter(Boolean),
    regioes: input.regioes.map((r) => r.trim()).filter(Boolean),
    disponivel: input.disponivel,
  };

  if (input.id) {
    const existing = await db.tecnicoDisponibilidade.findFirst({ where: { id: input.id, restaurantId: tenant.restaurantId } });
    if (!existing) return { error: "Técnico não encontrado." };
    await db.tecnicoDisponibilidade.update({ where: { id: input.id }, data });
  } else {
    await db.tecnicoDisponibilidade.create({ data: { restaurantId: tenant.restaurantId, ...data } });
  }
  revalidatePath("/configuracoes");
}

export async function removeTecnico(id: string) {
  const tenant = await getTenant();
  if (!MANAGER_ROLES.includes(tenant.role)) return { error: "Sem permissão para configurar técnicos." };

  const existing = await db.tecnicoDisponibilidade.findFirst({ where: { id, restaurantId: tenant.restaurantId } });
  if (!existing) return { error: "Técnico não encontrado." };
  await db.tecnicoDisponibilidade.delete({ where: { id } });
  revalidatePath("/configuracoes");
}
