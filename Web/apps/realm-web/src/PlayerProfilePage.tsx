import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "./App";

type SharedWorld = {
  world_key: string;
  world_name: string;
  game_version?: string | null;
  seed?: string | null;
  note_count?: number;
};

type Player = {
  account_id: string;
  realm_username?: string | null;
  minecraft_username?: string | null;
  minecraft_uuid?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  shared_worlds?: SharedWorld[];
};

export default function PlayerProfilePage() {
  const { playerId } = useParams();
  const [player, setPlayer] = useState<Player | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerId) return;
    setLoading(true);
    fetch(`${API_BASE}/api/public/player/${encodeURIComponent(playerId)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || "Profile not found");
        setPlayer(data.player as Player);
        setError(null);
      })
      .catch((e: Error) => {
        setPlayer(null);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [playerId]);

  if (loading) {
    return (
      <main className="page">
        <p>Loading profile…</p>
      </main>
    );
  }

  if (error || !player) {
    return (
      <main className="page">
        <h1>Player not found</h1>
        <p className="error">{error || "This profile is private or does not exist."}</p>
      </main>
    );
  }

  const worlds = player.shared_worlds || [];

  return (
    <main className="page">
      <div className="card profile-header">
        {player.avatar_url ? (
          <img className="avatar" src={player.avatar_url} alt="" />
        ) : null}
        <div>
          <h1>{player.realm_username || player.minecraft_username || "Player"}</h1>
          {player.minecraft_username ? (
            <p className="muted">Minecraft: {player.minecraft_username}</p>
          ) : null}
          {player.bio ? <p>{player.bio}</p> : null}
        </div>
      </div>

      <div className="card">
        <h2>Shared worlds</h2>
        {worlds.length === 0 ? (
          <p className="muted">No worlds shared on this profile yet.</p>
        ) : (
          <ul className="world-list">
            {worlds.map((w) => (
              <li key={w.world_key}>
                <strong>{w.world_name}</strong>
                {w.game_version ? ` · ${w.game_version}` : ""}
                {w.seed ? ` · seed ${w.seed}` : ""}
                {typeof w.note_count === "number" ? ` · ${w.note_count} notes` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="muted">
        Profile data from Minecraft Notes (BlockNotes). Future RootMC server integration will use
        the same Realm identity.
      </p>
    </main>
  );
}
