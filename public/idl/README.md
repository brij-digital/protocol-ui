Shared schema files in this directory are synced from [`apppack-runtime/schemas`](/home/ubuntu/src/apppack-runtime/schemas).

Do not hand-edit:
- `meta_idl.schema.v0.6.json`
- `meta_idl.core.schema.v0.6.json`
- `meta_view.schema.v0.2.json`
- `meta_view.schema.v0.3.json`
- `meta_app.schema.v0.1.json`

Use:
- `npm run schemas:sync`
- `npm run schemas:check`

This directory is also the current generated protocol-pack artifact source for downstream consumers.

In practice:
- authoring source lives in `aidl/` where available
- generated outputs land in `public/idl/`
- downstream consumers like `apppack-view-service` should sync from these generated outputs instead of editing parallel copies
