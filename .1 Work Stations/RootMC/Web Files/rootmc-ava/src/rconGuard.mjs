/**
 * Guarded RCON — real TCP when password + at least one host set.
 * Targets: claims (default), towny, or legacy AVA_RCON_HOST/PORT.
 * Blocked by emergency stop; dangerous commands denied.
 */
import net from "node:net";
import { isEmergencyStopped } from "./emergencyStop.mjs";

function rconPassword() {
  return String(process.env.AVA_RCON_PASSWORD || "").trim();
}

/** @returns {{ id: string, host: string, port: number }[]} */
export function rconTargets() {
  const password = rconPassword();
  if (!password) return [];

  const out = [];
  const claimsHost = String(
    process.env.AVA_RCON_CLAIMS_HOST || process.env.AVA_RCON_HOST || "",
  ).trim();
  const claimsPort = Number(
    process.env.AVA_RCON_CLAIMS_PORT || process.env.AVA_RCON_PORT || 25575,
  );
  if (claimsHost) out.push({ id: "claims", host: claimsHost, port: claimsPort });

  const townyHost = String(process.env.AVA_RCON_TOWNY_HOST || "").trim();
  const townyPort = Number(process.env.AVA_RCON_TOWNY_PORT || 25575);
  if (townyHost) out.push({ id: "towny", host: townyHost, port: townyPort });

  // Legacy single host that isn't already claims
  const legacyHost = String(process.env.AVA_RCON_HOST || "").trim();
  const legacyPort = Number(process.env.AVA_RCON_PORT || 25575);
  if (
    legacyHost &&
    !out.some((t) => t.host === legacyHost && t.port === legacyPort)
  ) {
    out.push({ id: "default", host: legacyHost, port: legacyPort });
  }

  return out;
}

export function rconConfigured() {
  return rconTargets().length > 0;
}

function pack(id, type, body) {
  const payload = Buffer.from(String(body) + "\0\0", "utf8");
  const len = 4 + 4 + payload.length;
  const buf = Buffer.alloc(4 + len);
  buf.writeInt32LE(len, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  payload.copy(buf, 12);
  return buf;
}

function readPacket(socket) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let needed = null;
    const onData = (d) => {
      chunks.push(d);
      const buf = Buffer.concat(chunks);
      if (needed == null && buf.length >= 4) needed = buf.readInt32LE(0) + 4;
      if (needed != null && buf.length >= needed) {
        socket.off("data", onData);
        const len = buf.readInt32LE(0);
        const id = buf.readInt32LE(4);
        const type = buf.readInt32LE(8);
        const body = buf.slice(12, 4 + len - 2).toString("utf8");
        resolve({ id, type, body });
      }
    };
    socket.on("data", onData);
    socket.on("error", reject);
    setTimeout(() => reject(new Error("rcon_timeout")), 8000);
  });
}

async function rconExec(command, target) {
  const password = rconPassword();
  const { host, port } = target;

  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port }, async () => {
      try {
        socket.write(pack(1, 3, password)); // AUTH
        const auth = await readPacket(socket);
        if (auth.id === -1) {
          socket.destroy();
          return reject(new Error("rcon_auth_failed"));
        }
        socket.write(pack(2, 2, command)); // COMMAND
        const res = await readPacket(socket);
        socket.end();
        resolve(res.body || "");
      } catch (err) {
        socket.destroy();
        reject(err);
      }
    });
    socket.on("error", reject);
  });
}

function resolveTarget(which) {
  const targets = rconTargets();
  if (!targets.length) return null;
  const key = String(which || "claims").toLowerCase().trim();
  return (
    targets.find((t) => t.id === key) ||
    targets.find((t) => t.id === "claims") ||
    targets[0]
  );
}

/**
 * @param {string} command
 * @param {{ allow?: boolean, target?: string }} [opts] target: claims | towny
 * @returns {Promise<{ ok: boolean, reason?: string, output?: string, target?: string }>}
 */
export async function guardedRcon(command, { allow = false, target = "claims" } = {}) {
  if (isEmergencyStopped()) {
    return { ok: false, reason: "emergency_stop" };
  }
  if (!allow) {
    return { ok: false, reason: "not_authorized" };
  }
  if (!rconConfigured()) {
    return { ok: false, reason: "rcon_not_configured" };
  }

  const cmd = String(command || "").trim();
  if (!cmd) return { ok: false, reason: "empty" };
  // Bare Paper stop / op — never. /rootrestart and /rootstop are allowed when allow=true.
  if (/\b(op|deop|ban-ip|whitelist\s+off|pardon-ip)\b/i.test(cmd)) {
    return { ok: false, reason: "blocked_command" };
  }
  if (/^(minecraft:)?stop\b/i.test(cmd) && !/^rootstop\b/i.test(cmd)) {
    return { ok: false, reason: "blocked_command" };
  }
  // Explicit staff restart path Ava is allowed to fire when allow=true
  const staffRestart = /^(rootrestart|rootstop)(\s+cancel)?$/i.test(cmd);
  if (!staffRestart && /^(restart|reload)\b/i.test(cmd)) {
    return { ok: false, reason: "blocked_command" };
  }
  // Safe read / private assist — list online + tell/msg/w (ingame chat batch)
  const safeAssist =
    /^list\b/i.test(cmd) ||
    /^(tell|msg|w|whisper)\s+[A-Za-z0-9_]{1,16}\s+\S/i.test(cmd);
  if (
    !staffRestart &&
    !safeAssist &&
    /^(ban|kick|pardon|whitelist|gamemode|give|xp|effect|fill|setblock|summon)\b/i.test(
      cmd,
    )
  ) {
    return { ok: false, reason: "blocked_command" };
  }

  const dest = resolveTarget(target);
  if (!dest) return { ok: false, reason: "rcon_not_configured" };

  try {
    const output = await rconExec(cmd, dest);
    return {
      ok: true,
      output: String(output).slice(0, 1500),
      target: dest.id,
    };
  } catch (err) {
    return { ok: false, reason: err.message || "rcon_error", target: dest.id };
  }
}

export function gatherRconBrief() {
  const targets = rconTargets();
  const lines = targets.length
    ? targets.map((t) => `- ${t.id}: ${t.host}:${t.port}`).join("\n")
    : "- (none)";
  return {
    brief: `### RCON
configured: ${rconConfigured() ? "yes" : "no"}
targets:
${lines}
emergency_stop: ${isEmergencyStopped() ? "ACTIVE — writes/RCON paused" : "clear"}
Dangerous cmds blocked. /rootrestart + /rootstop allowed when operator-authorized.
Execute only with operator allow + clear stop.`,
  };
}
