# AI-PAI Public Web Frontend

This is the source directory for the public user-facing UI.

Edit files under `apps/web/src`. Run `scripts/build-ui.ps1` to sync this source
tree into `public/web`, which is the static directory served by the Go binary.

## Structure

```text
src/
  app/
  api/
  components/
  features/
  styles/
```

The public UI should keep the current product behavior while replacing brittle
hand-built controls with stable feature components:

- prompt composer
- model and size selectors
- task placeholder
- image result grid
- history and plaza galleries
- account and credit surfaces
