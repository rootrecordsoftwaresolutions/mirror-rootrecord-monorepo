# Ava — SSH / headless Linux (Ubuntu OptiPlex)

Goal: run `rootmc-ava` on **ROOTATMUS_PRIME** Ubuntu Server over **SSH**, no GUI.

Full OptiPlex migration plan (copy SSD → D: partition, GRUB, etc.):  
[`ROOTATMUS_PRIME-Ubuntu-Server-SSH-Plan.md`](./ROOTATMUS_PRIME-Ubuntu-Server-SSH-Plan.md)

## Layout on Linux

**Locked storage rule (2026-08-01):**  
- **Laptop** runs Cursor → Remote-SSH into the OptiPlex.  
- **SATA (E:)** = mass storage / source Cursor opens (RootMC, RootRecord, all projects).  
- **Main SSD** = Ubuntu + caches/builders.  
See [`LINUX-E-SSD-LAYOUT.md`](../../../Server%20Handoffs/Ava%20Ivy/notes/LINUX-E-SSD-LAYOUT.md).

```
/mnt/e/.1 Work Stations/RootMC/     # Cursor workspace (E: source of truth)
  .env
  Web Files/rootmc-ava/
  Web Files/rootmc-realm-api/
  Server Handoffs/Ava Ivy/

/srv/rootmc/                        # optional bind-mount or thin runtime copy → same tree
~/.npm  ~/.gradle  (on SSD home)    # caches / builders — never the only source copy
```

Open Cursor Remote-SSH folder on the **E-mounted** Work Stations path (RootMC, RootRecord, all projects).
## Cold start (SSH session / tmux)

```bash
cd "/srv/rootmc/Web Files/rootmc-ava"
chmod +x scripts/start-ava.sh
./scripts/start-ava.sh
```

Or with systemd (preferred for disconnect-safe):

```bash
sudo cp scripts/ava-ivy.service /etc/systemd/system/
# edit User=/ paths if not /srv/rootmc
sudo systemctl daemon-reload
sudo systemctl enable --now ava-ivy
sudo journalctl -u ava-ivy -f
```

## Required env (auto-set by `start-ava.sh`)

| Var | Default |
|-----|---------|
| `AVA_HEADLESS` | `1` |
| `AVA_NO_STATUS_WINDOW` | `1` |
| `AVA_RICH_PRESENCE` | `0` |
| `AVA_HANDOFF` | `$WORKSPACE/Server Handoffs/Ava Ivy` |
| `AVA_WORKSPACE` | workspace root |
| `ROOTMC_ENV_FILE` | `$WORKSPACE/.env` |

Handoff path is **layout-relative** when unset — no more hardcoded `D:\…`.

## Status UI from laptop

Status binds to loopback only:

```bash
ssh -L 8787:127.0.0.1:8787 user@rootatmus-prime
# browser → http://127.0.0.1:8787/
```

## Operator lifecycle

| Action | Windows | Linux / SSH |
|--------|---------|-------------|
| Restart Ava (chat / upgrade) | PowerShell kill + `npm start` | `bash` + `pkill` + `nohup npm start` |
| Power down | PowerShell kill only | `pkill` only (no auto-start) |
| Boot | Task Scheduler / `npm start` | systemd `ava-ivy` or `start-ava.sh` |

## Checklist before cutover

1. SSD → D: / E: copies complete (see migration plan + `E:\MIGRATION-READY.txt`)
2. Ubuntu 24.04 Server; SSH key auth; SATA/E mounted
3. **Provision deps on SSD:**
   `sudo bash "/mnt/e/.1 Work Stations/RootMC/scripts/ubuntu-provision-ecosystem.sh"`
   (Node, JDK 17+25, Ollama/llama-class model, wrangler, Android cmdline, npm projects — see `UBUNTU-DEPENDENCIES.md`)
4. `.env` + credentials in place; `local.properties` from `local.properties.linux`
5. Clear `data/power-off.json` if present; start Ava via systemd
6. Stop Windows Ava so only one tree posts
7. Tunnel `:8787` smoke-test from laptop

## What is already portable

- `npm start` → Node supervisor (no `.bat` required)
- Cursor SDK Linux optional deps
- Host metrics fallback without PowerShell
- Discord / Slack / API — network only
