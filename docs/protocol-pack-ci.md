# Protocol Pack CI

This repo now includes a protocol-pack CI harness focused on data-driven safety for `IDL + Meta IDL` packs.

## Commands

```bash
npm run pack:check
npm run ci:protocol-packs
```

`ci:protocol-packs` runs:
1. `aidl:check` (generated Meta IDL up to date)
2. `pack:check` (pack validation)

## What `pack:check` validates

1. Registry integrity (`public/idl/registry.json`)
- required manifest fields
- unique protocol IDs
- valid public keys
- referenced `idlPath/metaPath` files exist

2. IDL / Meta consistency
- supported `meta.schema`
- `meta.protocolId` matches manifest ID
- declared `$schema` file exists
- if IDL has `address`, it matches registry `programId`

3. Deterministic operation materialization
- each operation is expanded (`templates + use + direct fields`)
- expansion run twice must produce identical output

4. Operation-level integrity
- materialized instruction exists in IDL (when instruction is present)
- discover / derive / compute step names are unique per phase

5. Fixture parity checks
- fixtures in `protocol-packs/fixtures/*.json`
- assert expected instruction and required args/accounts/steps

## Fixture format

```json
{
  "name": "Human readable check name",
  "protocolId": "orca-whirlpool-mainnet",
  "operationId": "swap_exact_in",
  "expect": {
    "instruction": "swap_v2",
    "requiredArgs": ["amount"],
    "requiredAccounts": ["whirlpool"],
    "requiredDiscoverSteps": ["pool_candidates"],
    "requiredDeriveSteps": ["wallet"],
    "requiredComputeSteps": ["other_amount_threshold"]
  }
}
```

All fields under `expect` are optional; only declared checks are enforced.
