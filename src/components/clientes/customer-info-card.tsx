"use client";

import { useState } from "react";
import { Pencil, Phone, MapPin, StickyNote } from "lucide-react";

import { CustomerForm } from "@/components/clientes/customer-form";
import type { CustomerDetail } from "@/server/queries/clientes";

export function CustomerInfoCard({ customer }: { customer: CustomerDetail }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <section className="rounded-[20px] border border-border bg-surface p-5">
        <CustomerForm initial={customer} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-5">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 className="text-[16px] font-semibold tracking-tight">{customer.name}</h2>
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            <Phone className="h-[13px] w-[13px]" />
            {customer.phone}
          </span>
          {customer.address ? (
            <span className="flex items-start gap-1.5 text-[13px] text-muted">
              <MapPin className="mt-0.5 h-[13px] w-[13px] flex-none" />
              {customer.address}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="grid h-8 w-8 flex-none place-items-center rounded-[9px] border border-border-strong text-muted transition-colors hover:border-accent hover:text-accent-hover"
          title="Editar"
        >
          <Pencil className="h-[14px] w-[14px]" />
        </button>
      </div>

      {customer.notes ? (
        <div className="flex items-start gap-2.5 rounded-[13px] bg-warn-bg px-3.5 py-3">
          <StickyNote className="mt-0.5 h-4 w-4 flex-none text-warn" />
          <span className="text-[13px] text-warn-fg">{customer.notes}</span>
        </div>
      ) : null}
    </section>
  );
}
