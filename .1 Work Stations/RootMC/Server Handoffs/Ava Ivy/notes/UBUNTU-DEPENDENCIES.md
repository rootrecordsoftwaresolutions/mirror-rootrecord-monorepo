# Ubuntu server dependencies — RootMC + RootRecord ecosystems

**Locked with:** `LINUX-E-SSD-LAYOUT.md` (laptop Cursor SSH · SATA/E mass storage · SSD caches)  
**Provision script:** `RootMC/scripts/ubuntu-provision-ecosystem.sh`  
**Hardware note:** OptiPlex ~32 GB RAM · CPU-only Ollama unless a GPU is added later

## Where things live

| What | Disk |
|------|------|
| Source trees (Work Stations) | **SATA / E:** `/mnt/e/.1 Work Stations/…` |
| Toolchains, caches, `node_modules`, Ollama models, Gradle | **Main SSD** (`/usr`, `~/.npm`, `~/.gradle`, `~/.ollama`, `/opt`) |

Script installs **on the SSD**. It does **not** replace copying E:; run after E is mounted and Ubuntu SSH works.

## Stack map

| Ecosystem piece | Needs |
|-----------------|--------|
| **rootmc-ava** | Node ≥20, npm, `@cursor/sdk` deps, Discord/Slack tokens in `.env` |
| **rootmc-api / realm-api / rootrecord-api-*** | Node, **wrangler**, Cloudflare auth |
| **rootmc-web** | Node, npm build, Pages deploy (wrangler) |
| **Plugin Building (Paper 26.x)** | **JDK 17** (Gradle daemon) + **JDK 25** (compile), git |
| **rootmc-android** | JDK 17, Android SDK cmdline tools, `ANDROID_HOME` |
| **Ava local brain (roadmap B3)** | **Ollama** + a coding model (CPU) |
| **Tunnels / status** | cloudflared (optional), OpenSSH |
| **Ops** | git, gh, curl, jq, unzip, build-essential, ffmpeg (media) |

## Versions (target)

| Tool | Version |
|------|---------|
| Ubuntu | 24.04 LTS |
| Node.js | **22.x LTS** (nvm or NodeSource) |
| JDK (Gradle) | **Temurin 17** |
| JDK (Paper 26 plugins) | **Temurin 25** |
| Ollama | latest stable |
| Default Ollama model | `ava-ivy` (Llama 3.1 8B + Ava SYSTEM from `E:\Ava Ivy\llama-baseline`) |
| Optional coding | `qwen2.5-coder:7b` · `codellama:7b` |
| Optional base only | `llama3.1:8b` |
| wrangler | npm global latest |
| pnpm | npm global latest |
| cloudflared | Cloudflare apt repo or github release |
| Android cmdline | latest `commandlinetools-linux` → `/opt/android-sdk` |

## Run (on Ubuntu after SSH)

```bash
# Mount SATA/E first, then:
sudo bash "/mnt/e/.1 Work Stations/RootMC/scripts/ubuntu-provision-ecosystem.sh"
# or from a copy on SSD:
sudo bash /srv/rootmc/scripts/ubuntu-provision-ecosystem.sh
```

Flags:

```bash
SKIP_OLLAMA=1        # skip Ollama + model pull
SKIP_ANDROID=1       # skip Android SDK
SKIP_NPM_PROJECTS=1  # skip npm ci in project trees
WORKSTATIONS=/mnt/e/.1\ Work\ Stations
OLLAMA_MODEL=qwen2.5-coder:7b
```

## After provision — smoke

```bash
node -v && java -version
javac -version
update-alternatives --list java
ollama list
wrangler --version
cloudflared --version
cd "$WORKSTATIONS/RootMC/Web Files/rootmc-ava" && npm start   # short smoke, then stop
cd "$WORKSTATIONS/RootMC/Plugin Building/Minecraft" && ./gradlew -v
```

Point `Plugin Building/Minecraft/local.properties` at Linux JDK paths (script writes a `local.properties.linux` example).

## Save from Windows (already on E backup)

Keep these on E (do not rely on SSD alone):

- `.1 Work Stations/` (all projects + **every `.env`** / `.credentials`)
- Run `powershell -File RootMC\scripts\ensure-env-on-e.ps1` so E mirrors D env files (copy, never move)
- On Ubuntu: `sudo bash …/sync-env-to-device.sh` → `/srv/rootmc/.env` + `secrets/` (E intact)
- See `ENV-PRESERVATION.md`

## Not installed by default

- Full Android Studio GUI (headless cmdline only)
- Docker (enable with `INSTALL_DOCKER=1`)
- CUDA / GPU Ollama (no discrete GPU on OptiPlex as of plan)
- Minecraft Paper server runtime on the OptiPlex (live games stay Shockbyte)
