import { redirect } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";

import { auth } from "@/lib/auth";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage(props: PageProps<"/login">) {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  const searchParams = await props.searchParams;
  const callbackUrlParam = Array.isArray(searchParams.callbackUrl) ? searchParams.callbackUrl[0] : searchParams.callbackUrl;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="flex w-full max-w-[380px] flex-col gap-7">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="grid h-11 w-11 place-items-center rounded-[12px] bg-charcoal">
            <UtensilsCrossed className="h-5 w-5" style={{ color: "#4FC3CE" }} />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-[19px] font-semibold tracking-tight">Balcão</h1>
            <p className="text-[13px] text-faint">Entre para acompanhar a operação do seu restaurante</p>
          </div>
        </div>

        <div className="rounded-[20px] border border-border bg-surface p-7 shadow-[0_1px_2px_rgba(26,29,35,.04)]">
          <LoginForm callbackUrl={callbackUrlParam} />
        </div>
      </div>
    </div>
  );
}
