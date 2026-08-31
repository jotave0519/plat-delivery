"use client";

import { useState, useTransition } from "react";

import { saveOpeningHours } from "@/server/actions/configuracoes";
import { WEEKDAYS, type OpeningHours, type Weekday } from "@/lib/opening-hours";

const DAY_LABELS: Record<Weekday, string> = {
  seg: "Segunda",
  ter: "Terça",
  qua: "Quarta",
  qui: "Quinta",
  sex: "Sexta",
  sab: "Sábado",
  dom: "Domingo",
};

export function OpeningHoursForm({ initial }: { initial: OpeningHours }) {
  const [hours, setHours] = useState<OpeningHours>(initial);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function updateDay(day: Weekday, patch: Partial<OpeningHours[Weekday]>) {
    setSaved(false);
    setHours((h) => ({ ...h, [day]: { ...h[day], ...patch } }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await saveOpeningHours(hours);
      setSaved(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
      {WEEKDAYS.map((day) => {
        const d = hours[day];
        return (
          <div key={day} className="flex flex-wrap items-center gap-3">
            <span className="w-20 flex-none text-[13.5px] font-medium">{DAY_LABELS[day]}</span>
            <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
              <input
                type="checkbox"
                checked={!d.closed}
                onChange={(e) => updateDay(day, { closed: !e.target.checked })}
                className="h-3.5 w-3.5 accent-charcoal"
              />
              Aberto
            </label>
            {!d.closed ? (
              <>
                <input
                  type="time"
                  value={d.open}
                  onChange={(e) => updateDay(day, { open: e.target.value })}
                  className="rounded-[9px] border border-border-strong px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
                />
                <span className="text-[12px] text-faint">até</span>
                <input
                  type="time"
                  value={d.close}
                  onChange={(e) => updateDay(day, { close: e.target.value })}
                  className="rounded-[9px] border border-border-strong px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
                />
              </>
            ) : (
              <span className="text-[12.5px] text-faint">Fechado</span>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-[40px] items-center justify-center rounded-[10px] bg-charcoal px-5 text-[13.5px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? "Salvando…" : "Salvar horário"}
        </button>
        {saved ? <span className="text-[12.5px] text-ok-fg">Salvo</span> : null}
      </div>
    </form>
  );
}
