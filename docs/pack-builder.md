# Protocol Pack Builder (Human Tooling)

This doc covers the new human-facing tooling for creating and validating protocol packs.

## 1) Initialize a new pack scaffold

```bash
npm run pack:init -- \
  --id my-protocol-mainnet \
  --name "My Protocol" \
  --program-id 11111111111111111111111111111111 \
  --network mainnet-beta \
  --transport local-my-protocol \
  --status inactive \
  --commands /my-protocol
```

What it creates:
- `aidl/<slug>.aidl.json` (authoring source)
- `public/idl/<slug>.json` (IDL scaffold)
- `public/idl/registry.json` entry
- then runs `npm run aidl:compile` to generate `public/idl/<slug>.meta.json`

Notes:
- default `status` is `inactive` (safer for CI while scaffolding)
- use `--overwrite` to replace existing scaffold files/registry entry
- `--commands` accepts comma-separated values (`/a,/b`)

## 2) Run targeted diagnostics while building

Check one protocol:

```bash
npm run pack:doctor -- --protocol my-protocol-mainnet
```

Check all protocols:

```bash
npm run pack:doctor
```

Strict mode (warnings fail the command):

```bash
npm run pack:doctor -- --strict
```

Doctor checks:
- registry entry + file existence
- IDL / Meta JSON parse + protocolId/schema sanity
- `user_forms` wiring (`form.operation` points to an existing operation)
- AIDL target linkage (`target.protocolId` and `target.output` hints)
- active protocol warning when no `user_forms` are declared

## 3) Compile and CI checks

```bash
npm run aidl:compile
npm run aidl:check
npm run pack:check
```

Optional RPC parity/simulation checks:

```bash
npm run pack:rpc-check
```

## Recommended workflow

1. `pack:init` scaffold
2. replace scaffold IDL + AIDL with real protocol data
3. add end-user `user_forms` and geek operations
4. `aidl:compile`
5. `pack:doctor -- --protocol <id>`
6. `pack:check`
7. add fixtures and RPC checks before activation
