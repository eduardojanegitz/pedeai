import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { getMenu } from "@/lib/catalog.functions";
import { getMyOrder, getActiveRound, type ActiveRound } from "@/lib/orders.functions";
import { getToken } from "@/lib/participant";
import { Celebrate } from "@/features/order/Celebrate";
import { ConfirmedOrder } from "@/features/order/ConfirmedOrder";
import { IdentifyScreen } from "@/features/order/IdentifyScreen";
import { OrderFlow } from "@/features/order/OrderFlow";
import { Shell } from "@/features/order/Shell";
import { ClosedScreen, NoRoundScreen, WaitingScreen } from "@/features/order/StatusScreens";
import { btnPrimary } from "@/features/order/ui";

const menuQuery = queryOptions({ queryKey: ["menu"], queryFn: () => getMenu(), staleTime: 60_000 });
const roundQuery = queryOptions({
  queryKey: ["active-round"],
  queryFn: () => getActiveRound(),
  refetchInterval: 30_000,
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PedeAí! — Faça seu pedido" },
      { name: "description", content: "Escolha seus itens no cardápio e confirme seu pedido." },
      { property: "og:title", content: "PedeAí! — Faça seu pedido" },
      {
        property: "og:description",
        content: "Escolha seus itens no cardápio e confirme seu pedido.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Loading() {
  return (
    <Shell>
      <Logo className="text-6xl" />
      <div
        role="status"
        className="mt-6 flex items-center justify-center gap-2 text-muted-foreground"
      >
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Carregando o cardápio…
      </div>
    </Shell>
  );
}

function Index() {
  const round = useQuery(roundQuery);
  const refetchRound = useCallback(() => void round.refetch(), [round]);

  if (round.isPending) return <Loading />;
  if (round.isError) {
    return (
      <Shell>
        <Logo className="text-6xl" />
        <h1 className="mt-6 text-4xl">Ops, sem conexão</h1>
        <p className="mt-3 text-muted-foreground">
          Não foi possível carregar o cardápio. Verifique sua internet.
        </p>
        <button className={`${btnPrimary} mt-6`} onClick={refetchRound}>
          Tentar de novo
        </button>
      </Shell>
    );
  }
  if (!round.data) return <NoRoundScreen />;
  return (
    <Participant round={round.data} fetchedAt={round.dataUpdatedAt} refetchRound={refetchRound} />
  );
}

/** Decide a tela do participante: estado da rodada, identificação, pedido existente ou jornada de escolha. */
function Participant({
  round,
  fetchedAt,
  refetchRound,
}: {
  round: ActiveRound;
  fetchedAt: number;
  refetchRound: () => void;
}) {
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => setToken(getToken()), []);

  const me = useQuery({
    queryKey: ["my-order", token, round.id],
    queryFn: () => getMyOrder({ data: { token: token!, roundId: round.id } }),
    enabled: !!token,
  });
  const menu = useQuery({ ...menuQuery, enabled: round.state === "open" || !!me.data });

  const [editing, setEditing] = useState(false);
  const [celebrate, setCelebrate] = useState<{ update: boolean } | null>(null);
  const [lastWasUpdate, setLastWasUpdate] = useState(false);

  if (token === undefined || (token && me.isPending)) return <Loading />;

  const identified = !!token && !!me.data && !me.isError;
  const confirmed = identified && me.data?.status === "confirmed";

  // Fora do horário: só quem já tem pedido confirmado vê o pedido; os demais veem a tela do estado.
  if (round.state !== "open" && !(confirmed && round.state === "closed")) {
    return round.state === "waiting" ? (
      <WaitingScreen round={round} fetchedAt={fetchedAt} onOpen={refetchRound} />
    ) : (
      <ClosedScreen round={round} />
    );
  }

  if (!identified) {
    return (
      <IdentifyScreen
        roundName={round.name}
        onDone={(t) => {
          setToken(t);
          void qc.invalidateQueries({ queryKey: ["my-order"] });
        }}
      />
    );
  }

  if (menu.isPending) return <Loading />;
  if (menu.isError || !menu.data) {
    return (
      <Shell>
        <h1 className="text-4xl">Não foi possível carregar o cardápio</h1>
        <button className={`${btnPrimary} mt-6`} onClick={() => void menu.refetch()}>
          Tentar de novo
        </button>
      </Shell>
    );
  }
  const data = me.data!;

  return (
    <>
      <Celebrate
        show={celebrate !== null}
        update={celebrate?.update ?? false}
        onDone={() => setCelebrate(null)}
      />
      {confirmed && !editing ? (
        <ConfirmedOrder
          round={round}
          token={token!}
          me={data}
          menu={menu.data}
          canEdit={round.state === "open"}
          justUpdated={lastWasUpdate}
          onEdit={() => setEditing(true)}
        />
      ) : (
        <OrderFlow
          key={data.participant.id}
          round={round}
          token={token!}
          me={data}
          menu={menu.data}
          existing={confirmed}
          onExit={() => setEditing(false)}
          onSaved={({ isUpdate }) => {
            setLastWasUpdate(isUpdate);
            setEditing(false);
            setCelebrate({ update: isUpdate });
          }}
        />
      )}
    </>
  );
}
