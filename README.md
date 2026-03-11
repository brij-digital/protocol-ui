# Espresso Cash AI Wallet MVP (Web)

This repository is a command-driven web demo for an Espresso Cash AI Wallet MVP.

Current scope:
- Single-signature wallet approval (no Swig/passkeys yet)
- One active swap integration via Orca Whirlpools on Solana mainnet
- One base IDL + one Meta IDL (`meta-idl.v0.3`) for declarative action derivation
- Chat-style command input with deterministic command parsing

## Commands

- `/help`
- `/swap <INPUT_TOKEN> <OUTPUT_TOKEN> <AMOUNT> [SLIPPAGE_BPS]`
- `/quote <INPUT_TOKEN> <OUTPUT_TOKEN> <AMOUNT> [SLIPPAGE_BPS]`
- `/write-raw <PROTOCOL_ID> <INSTRUCTION_NAME> | <ARGS_JSON> | <ACCOUNTS_JSON>`
- `/read-raw <PROTOCOL_ID> <INSTRUCTION_NAME> | <ARGS_JSON> | <ACCOUNTS_JSON>`
- `/idl-list`
- `/idl-template <PROTOCOL_ID> <INSTRUCTION_NAME>`
- `/idl-view <PROTOCOL_ID> <ACCOUNT_TYPE> <ACCOUNT_PUBKEY>`

Examples:

```text
/quote SOL USDC 0.1 50
/swap SOL USDC 0.1 50
```

Raw examples:

```text
/read-raw orca-whirlpool-mainnet swap | {"amount":"1000","other_amount_threshold":"1","sqrt_price_limit":"0","amount_specified_is_input":true,"a_to_b":true} | {"token_authority":"$WALLET","whirlpool":"<PUBKEY>","token_owner_account_a":"<PUBKEY>","token_vault_a":"<PUBKEY>","token_owner_account_b":"<PUBKEY>","token_vault_b":"<PUBKEY>","tick_array_0":"<PUBKEY>","tick_array_1":"<PUBKEY>","tick_array_2":"<PUBKEY>","oracle":"<PUBKEY>"}
/write-raw orca-whirlpool-mainnet swap | {"amount":"1000","other_amount_threshold":"1","sqrt_price_limit":"0","amount_specified_is_input":true,"a_to_b":true} | {"token_authority":"$WALLET","whirlpool":"<PUBKEY>","token_owner_account_a":"<PUBKEY>","token_vault_a":"<PUBKEY>","token_owner_account_b":"<PUBKEY>","token_vault_b":"<PUBKEY>","tick_array_0":"<PUBKEY>","tick_array_1":"<PUBKEY>","tick_array_2":"<PUBKEY>","oracle":"<PUBKEY>"}
```

Supported token aliases for `/swap` and `/quote`:
- `SOL`
- `USDC`

## IDL + Meta IDL

- Base IDL: `public/idl/orca_whirlpool.json`
- Meta IDL: `public/idl/orca_whirlpool.meta.json`
- Meta IDL schema: `public/idl/meta_idl.schema.v0.3.json`
- Tutorial: `docs/meta-idl-tutorial.md`
  - Detailed end-to-end walkthrough of current `/quote` and `/swap` flow
- Registry: `public/idl/registry.json`
- Context registry: `src/lib/metaContextRegistry.ts`
- Orca context adapter: `src/protocols/orca/contextResolvers.ts`
- Compute registry (plugin dispatch): `src/lib/metaComputeRegistry.ts`
- Shared SDK coercion helpers: `src/lib/sdk/coerce.ts`
- Shared runtime value normalizer: `src/lib/sdk/runtimeValue.ts`

Meta action used by `/swap` and `/quote`:
- `swap_exact_in`
- compiled instruction: `swap_v2`

Meta IDL v0.3 resolver primitives currently implemented in runtime:
- `wallet_pubkey`
- `decode_account`
- `ata`
- `pda`
- `lookup` (generic relation query primitive; not used in current Orca swap template)
- `unix_timestamp`

Meta IDL v0.3 context primitives currently implemented in runtime:
- `context.mock` (generic)
- `context.query_http_json` (generic)
- `context.compare_values` (generic)
- `context.orca_whirlpool_pools_for_pair` (on-chain Orca pool discovery)
- `context.pick_list_item`

Meta IDL v0.3 compute primitives currently implemented in runtime:
- `math.add`
- `math.mul`
- `math.floor_div`
- `list.range_map`
- `pda(seed_spec)`

Meta IDL v0.3 supports template expansion:
- `templates.<name>.expand` defines reusable declarative blocks.
- `actions.<action>.use[]` applies templates with parameter mapping via `$param.*`.

Meta IDL execution supports optional declarative `post` steps:
- current built-in: `spl_token_close_account`
- used to auto-unwrap WSOL output (close WSOL ATA after swap when output mint is SOL)

If multiple pools are found for a pair, the app prompts the user to choose pool `1/2/3...` before continuing quote/swap execution.

## Run Locally

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Notes

- The app targets `mainnet-beta` by default.
- Swap execution requires a connected Phantom wallet.
- `/swap` and `/quote` are strict declarative wrappers: context + derive gather on-chain state, then app uses RPC simulation to estimate output and compute slippage threshold before send.
- Pool discovery currently uses `getProgramAccounts` on Orca with account discriminator filtering and local decode/filter by mint pair.
- Meta execution pipeline is split into phases: `context` (pool discovery + selection) -> `derive` (on-chain/account gather) -> `compute` (deterministic pure transforms) -> IDL build -> `simulate` or `send`.
- SOL output is auto-unwrapped by default via declarative meta `post` step (`spl_token_close_account`).
