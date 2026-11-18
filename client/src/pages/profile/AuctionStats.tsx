import { type AuctionHistoryEntry, type AuctionStats, type GameResult, isDeletedUsername } from "@pokemon-minigames/shared";
import { Link } from "react-router";
import { Avatar } from "../../components/Avatar";
import { Badge } from "../../components/Badge";
import { Notice } from "../../components/Notice";
import { rise } from "../../components/rise";
import { StatTile } from "../../components/StatTile";
import { spriteUrl } from "../../catalog/artwork";
import { AUCTION_PROFILE_TEXT, DELETED_ACCOUNT_NAME, RESULT_LABELS, historyReason } from "../../i18n/es";
import { useServices } from "../../services";
import { formatDate, formatPercent } from "./format";
import { useLoad } from "./use-load";

const RESULT_TONE: Record<GameResult, "success" | "neutral" | "danger"> = { won: "success", drawn: "neutral", lost: "danger" };

/** El resumen de la subasta (#40), aparte del de Doble tipo: sale aunque no se haya jugado a Doble tipo. */
export function AuctionStatsView({ auction, own }: { auction: AuctionStats; own: boolean }) {
  return (
    <section aria-label={AUCTION_PROFILE_TEXT.title} style={rise(4)} className="animate-rise">
      <h2 className="mb-3 font-display text-lg font-semibold">{AUCTION_PROFILE_TEXT.title}</h2>
      {auction.played === 0 ? (
        <Notice>{own ? AUCTION_PROFILE_TEXT.noneOwn : AUCTION_PROFILE_TEXT.noneOther}</Notice>
      ) : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Partidas" value={String(auction.played)} />
          <StatTile label="Victorias" value={String(auction.wins)} />
          <StatTile label="Derrotas" value={String(auction.losses)} />
          <StatTile label="Porcentaje" value={formatPercent(auction.winRate)} ring={auction.winRate} />
        </dl>
      )}
    </section>
  );
}

function AuctionRow({ game }: { game: AuctionHistoryEntry }) {
  const deleted = isDeletedUsername(game.opponent.username);
  return (
    <li className="framed rounded-card bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3">
        <Avatar name={deleted ? DELETED_ACCOUNT_NAME : game.opponent.username} avatarId={game.opponent.avatarId} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">
            contra{" "}
            {deleted ? (
              <span className="font-semibold">{DELETED_ACCOUNT_NAME}</span>
            ) : (
              <Link to={`/jugador/${encodeURIComponent(game.opponent.username)}`} className="font-semibold underline">
                {game.opponent.username}
              </Link>
            )}
          </p>
          <p className="text-sm text-muted">{historyReason(game.reason, game.result)}</p>
        </div>
        <Badge tone={RESULT_TONE[game.result]}>{RESULT_LABELS[game.result]}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="sr-only">{AUCTION_PROFILE_TEXT.team(game.team.length)}</span>
        {game.team.map((id, index) => (
          <img key={`${id}-${index}`} data-team-member src={spriteUrl(id)} alt="" className="size-10 [image-rendering:pixelated]" />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">
        <time dateTime={game.endedAt}>{formatDate(game.endedAt)}</time>
      </p>
    </li>
  );
}

/** Tus últimas subastas (#40): solo en tu perfil, las 10 más recientes. */
export function AuctionHistoryList() {
  const { endpoints } = useServices();
  const { state, reload } = useLoad(() => endpoints.stats.auctionHistory(), [endpoints]);
  return (
    <section aria-label={AUCTION_PROFILE_TEXT.recent} style={rise(5)} className="animate-rise">
      <h2 className="mb-3 font-display text-lg font-semibold">{AUCTION_PROFILE_TEXT.recent}</h2>
      {state.status === "loading" ? <p className="text-sm text-muted">{AUCTION_PROFILE_TEXT.loading}</p> : null}
      {state.status === "error" ? (
        <Notice tone="danger">
          {AUCTION_PROFILE_TEXT.failed}{" "}
          <button type="button" className="underline" onClick={reload}>
            {AUCTION_PROFILE_TEXT.retry}
          </button>
        </Notice>
      ) : null}
      {state.status === "ready" && state.data.games.length === 0 ? <p className="text-sm text-muted">{AUCTION_PROFILE_TEXT.noneOwn}</p> : null}
      {state.status === "ready" && state.data.games.length > 0 ? (
        <ol aria-label={AUCTION_PROFILE_TEXT.recent} className="flex flex-col gap-3">
          {state.data.games.map((game) => (
            <AuctionRow key={game.id} game={game} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}
