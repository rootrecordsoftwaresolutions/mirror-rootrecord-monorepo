# RootMC admin model (LuckPerms-first)

RootMC staff permissions are managed in **LuckPerms**, not `ops.json`.

## Policy

- Keep `ops.json` to owner/host break-glass accounts only.
- Assign moderators to LuckPerms `admin` group (non-OP).
- Donor progression is `default` -> `pro` -> `lifetime` on track `donor`.

## Staff assignment

Use console on the live server:

```text
lp user <name> parent add admin
lp sync
```

## If older OP entries exist

- Remove non-owner staff from `ops.json`.
- Restart Paper.
- Re-assign with LuckPerms `admin`.
