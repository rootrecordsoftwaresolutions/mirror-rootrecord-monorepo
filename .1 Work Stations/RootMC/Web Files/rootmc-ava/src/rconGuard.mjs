/**
 * Guarded RCON — real TCP when AVA_RCON_HOST + AVA_RCON_PASSWORD set.
 * Blocked by emergency stop; dangerous commands denied.
 */
import net from "node:net";
import { isEmergencyStopped } from "./emergencyStop.mjs";

export function rconConfigured() {
  return Boolean(
    String(process.env.AVA_RCON_HOST || "").trim() &&
      String(process.env.AVA_RCON_PASSWORD || "").trim(),
  );
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

async function rconExec(command) {
  const host = String(process.env.AVA_RCON_HOST || "").trim();
  const port = Number(process.env.AVA_RCON_PORT || 25575);
  const password = String(process.env.AVA_RCON_PASSWORD || "");

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

/**
 * @returns {Promise<{ ok: boolean, reason?: string, output?: string }>}
 */
export async function guardedRcon(command, { allow = false } = {}) {
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
  if (/\b(op|deop|ban-ip|stop|whitelist\s+off|pardon-ip)\b/i.test(cmd)) {
    return { ok: false, reason: "blocked_command" };
  }

  try {
    const output = await rconExec(cmd);
    return { ok: true, output: String(output).slice(0, 1500) };
  } catch (err) {
    return { ok: false, reason: err.message || "rcon_error" };
  }
}

export function gatherRconBrief() {
  return {
    brief: `### RCON
configured: ${rconConfigured() ? "yes" : "no"}
emergency_stop: ${isEmergencyStopped() ? "ACTIVE — writes/RCON paused" : "clear"}
Dangerous cmds blocked. Execute only with operator allow + clear stop.`,
  };
}
