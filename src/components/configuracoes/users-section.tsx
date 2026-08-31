"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, UserPlus } from "lucide-react";

import { createUser, deleteUser, updateUserRole } from "@/server/actions/configuracoes";
import { ConfirmButton } from "@/components/ui/confirm-button";
import type { UserListItem } from "@/server/queries/configuracoes";
import type { Role } from "@/generated/prisma";

const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Proprietário(a)",
  ADMIN: "Administrador(a)",
  ATTENDANT: "Atendente",
  KITCHEN: "Cozinha",
};
const ROLES: Role[] = ["OWNER", "ADMIN", "ATTENDANT", "KITCHEN"];

const inputClass =
  "rounded-[10px] border border-border-strong bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent";

function UserRow({ user, currentUserId, canManage }: { user: UserListItem; currentUserId: string; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRoleChange(role: Role) {
    setError(null);
    startTransition(async () => {
      const result = await updateUserRole({ userId: user.id, role });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13.5px] font-medium">
            {user.name} {user.id === currentUserId ? <span className="text-faint">(você)</span> : null}
          </span>
          <span className="truncate text-[12px] text-faint">{user.email}</span>
        </div>
        {canManage ? (
          <select
            value={user.role}
            disabled={pending}
            onChange={(e) => handleRoleChange(e.target.value as Role)}
            className="rounded-[9px] border border-border-strong px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        ) : (
          <span className="rounded-[8px] bg-neutral-bg px-2.5 py-1 text-[12px] font-medium text-neutral-fg">
            {ROLE_LABELS[user.role]}
          </span>
        )}
        {canManage ? (
          <ConfirmButton
            action={deleteUser.bind(null, user.id)}
            confirmMessage={`Remover "${user.name}"?`}
            icon={<Trash2 className="h-[13px] w-[13px]" />}
            disabled={user.id === currentUserId}
            className="grid h-8 w-8 flex-none place-items-center rounded-[9px] border border-border-strong text-muted transition-colors hover:border-crit hover:text-crit disabled:opacity-30"
          />
        ) : null}
      </div>
      {error ? <p className="text-[12px] text-crit-fg">{error}</p> : null}
    </div>
  );
}

function AddUserForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("ATTENDANT");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createUser({ name, email, password, role });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setName("");
      setEmail("");
      setPassword("");
      setRole("ATTENDANT");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 rounded-[13px] border border-dashed border-border-strong p-3.5">
      <div className="flex flex-wrap gap-2.5">
        <input className={`${inputClass} flex-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" />
        <input className={`${inputClass} flex-1`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" type="email" />
        <input
          className={`${inputClass} w-40`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha inicial"
          type="password"
        />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="text-[12.5px] text-crit-fg">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="flex w-fit items-center gap-2 rounded-[9px] bg-charcoal px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        <Plus className="h-[14px] w-[14px]" />
        {pending ? "Adicionando…" : "Adicionar usuário"}
      </button>
    </form>
  );
}

export function UsersSection({
  users,
  currentUserId,
  canManage,
}: {
  users: UserListItem[];
  currentUserId: string;
  canManage: boolean;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      {canManage ? (
        <AddUserForm />
      ) : (
        <p className="flex items-center gap-2 text-[12.5px] text-faint">
          <UserPlus className="h-[14px] w-[14px]" />
          Só o proprietário pode adicionar ou remover usuários.
        </p>
      )}
      <div className="flex flex-col divide-y divide-border-soft">
        {users.map((user) => (
          <UserRow key={user.id} user={user} currentUserId={currentUserId} canManage={canManage} />
        ))}
      </div>
    </div>
  );
}
