# ai-pai Admin Frontend

This is the source directory for the admin UI.

Edit files under `apps/admin/src`. Run `scripts/build-ui.ps1` to sync this
source tree into `public/admin`, which is the static directory served by the Go
binary.

## Structure

```text
src/
  app/
  api/
  components/
  features/
  styles/
```

The admin UI should follow a NewAPI-style management console:

- compact left navigation
- dense data tables
- short filter toolbars
- form drawers or modals for edits
- clear status badges and operation buttons
- strong overflow handling for long model names and keys
