import { getTenant } from "@/lib/tenant";
import { listFeedbacks } from "@/server/queries/feedbacks";
import { FeedbackList } from "@/components/feedbacks/feedback-list";

export default async function FeedbacksPage() {
  const tenant = await getTenant();
  const feedbacks = await listFeedbacks(tenant.restaurantId);

  const responded = feedbacks.filter((f) => f.responseText);
  const ratings = responded.map((f) => f.rating).filter((r): r is number => r != null);
  const avgRating = ratings.length > 0 ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;

  return (
    <div className="flex flex-col gap-5 px-[clamp(18px,2.4vw,34px)] py-7 pb-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Feedbacks</h1>
        <p className="text-[13px] text-faint">
          Depois que um pedido do WhatsApp é concluído, o cliente recebe uma mensagem perguntando o que achou —
          {" "}~3h depois, automaticamente.{" "}
          {responded.length > 0
            ? `${responded.length} resposta${responded.length === 1 ? "" : "s"} recebida${responded.length === 1 ? "" : "s"}${avgRating ? ` · nota média ${avgRating}/10` : ""}.`
            : null}
        </p>
      </div>

      <FeedbackList feedbacks={feedbacks} />
    </div>
  );
}
