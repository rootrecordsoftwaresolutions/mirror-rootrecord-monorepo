import { useGame } from "../contexts/GameContext";
import { isAttackEvent, isBlockEvent } from "../game/storeCatalog";

export function VarmintAlertModal() {
  const { activeVarmintEvent, dismissActiveVarmint } = useGame();
  if (!activeVarmintEvent) return null;

  const attack = isAttackEvent(activeVarmintEvent.kind);
  const blocked = isBlockEvent(activeVarmintEvent.kind);

  return (
    <div className="varmint-overlay" role="dialog" aria-modal="true" aria-labelledby="varmint-alert-title">
      <div className={`varmint-card${attack ? " varmint-card--attack" : ""}${blocked ? " varmint-card--block" : ""}`}>
        <h2 id="varmint-alert-title" className="varmint-card-title">
          {attack ? "Varmint attack" : blocked ? "Protection worked" : "Farm alert"}
        </h2>
        <p className="varmint-card-msg">{activeVarmintEvent.message}</p>
        <button type="button" className="btn btn-primary btn-block" onClick={() => void dismissActiveVarmint()}>
          OK
        </button>
      </div>
    </div>
  );
}
