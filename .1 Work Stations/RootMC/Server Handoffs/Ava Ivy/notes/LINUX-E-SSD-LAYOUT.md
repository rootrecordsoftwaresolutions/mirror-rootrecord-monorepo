# Storage layout — Linux SSH + Cursor (locked)

**Updated:** 2026-08-01  
**Applies to:** RootMC · RootRecord · all Work Stations projects

## Machines

| Machine | Role |
|---------|------|
| **Laptop** | Where **Cursor runs** (UI). Remote-SSH into the server. Day / play machine. |
| **OptiPlex (`rootatmus-prime`)** | Headless Ubuntu Server. Ava + digs + builds over SSH. |

## Disks on the server

| Disk | Role |
|------|------|
| **Main SSD** | Ubuntu + fast path: npm / Gradle / JDK / Cursor agent caches / builders Cursor creates remotely |
| **SATA (E: mass storage)** | Durable bulk: `.1 Work Stations`, `windows backup`, worlds, archives. Cursor **opens** projects from here over SSH. |

Cursor does **not** live as a desktop app on the OptiPlex. You run Cursor on the **laptop**, SSH into Linux, and open the E-mounted Work Stations tree. Agents rebuild caches/builders onto the **SSD**.

## Rule

| Role | Where | Why |
|------|--------|-----|
| **Cursor app** | **Laptop** | Remote-SSH client |
| **Source Cursor opens** | **SATA / E:** Work Stations | Mass storage; RootMC, RootRecord, all projects |
| **Caches · builders · toolchains** | **Main SSD** (server home) | Fast I/O for digs |

Do **not** treat the SSD as the only copy of source — SATA/E holds the durable trees.

## Windows → Linux path map (target)

| Windows now | Linux target (suggested) |
|-------------|--------------------------|
| `E:\.1 Work Stations\` | `/mnt/e/.1 Work Stations/` (SATA mass storage) |
| `E:\windows backup\` | `/mnt/e/windows-backup/` (reference) |
| RootMC / RootRecord / all projects | Under that Work Stations tree on SATA |
| npm / pnpm / yarn cache | `~/.npm` etc. on **SSD home** |
| Gradle / JDK | `~/.gradle` · SDK on **SSD** |
| Remote Cursor server cache | Cursor Linux user dir on **SSD** |
| Ava runtime | systemd on server; handoff data can stay on SATA |

## Cursor workflow (laptop → SSH)

1. OptiPlex Ubuntu up; SATA (E:) mounted at `/mnt/e`.
2. On **laptop**: Cursor → **Remote-SSH** → `rootatmus-prime`.
3. Open folder: `/mnt/e/.1 Work Stations/RootMC` (and siblings for RootRecord / etc.).
4. **One-time:** provision toolchains on SSD:
   ```bash
   sudo bash "/mnt/e/.1 Work Stations/RootMC/scripts/ubuntu-provision-ecosystem.sh"
   ```
   Installs Node 22, JDK 17+25, Ollama (+ coding model), wrangler, pnpm, cloudflared, Android cmdline, `npm ci` for Web Files. Manifest: `notes/UBUNTU-DEPENDENCIES.md`.
5. Builds write caches to SSD home; source stays on SATA.
6. Ava: `systemd` on server; status tunnel from laptop `:8787` if needed.

## Projects in scope

Everything under Work Stations on E/SATA — not only RootMC (RootRecord, Marketing, credentials, plugins, mobile, APIs).

## Do / don't

- **Do** run Cursor from the laptop over SSH.
- **Do** keep mass source on SATA/E; let SSD hold rebuildable caches.
- **Do** keep every `.env` intact on E; copy to device with `sync-env-to-device.sh` (`ENV-PRESERVATION.md`).
- **Don't** wipe E/SATA until SSH + one successful dig smoke.
- **Don't** put the only copy of source (or `.env`) solely on SSD.
- **Don't** move/delete `.env` off E — copy only.

## Related

- Migration ready: `E:\MIGRATION-READY.txt`
- Dependencies: `notes/UBUNTU-DEPENDENCIES.md` · `scripts/ubuntu-provision-ecosystem.sh`
- OptiPlex plan: `docs/ROOTATMUS_PRIME-Ubuntu-Server-SSH-Plan.md`
- Ava SSH: `Web Files/rootmc-ava/docs/SSH-LINUX.md`
