# CSPAMS 2.0 - Compliance Document Upload Redesign (April 2026)

```ts
// NEW 2026 COMPLIANCE UI: BMEF tab replaces TARGETS-MET
// 4-tab layout (School Achievements | Key Performance | BMEF | SMEA)
// Monitor & School Head views updated for DepEd standards
```

> April 2026 compliance UI refactor - TARGETS-MET renamed to BMEF with 4-tab layout.

## Scope

This document defines the official compliance package behavior for CSPAMS 2.0.

- Platform identity: DepEd-focused compliance monitoring for school heads and division monitors.
- Single package model: one `indicator_submissions` record per school and academic year package.
- I-META data is encoded in-app.
- BMEF and SMEA are upload-only document requirements.
- Database compatibility remains unchanged: backend storage columns still use `targets_met_*` and `smea_*` naming where applicable.

## School Head Experience (4-Tab Compliance Layout)

The school-facing compliance workspace must render exactly four tabs in this order:

1. School Achievements
2. Key Performance
3. BMEF
4. SMEA

Rules:

- School Achievements and Key Performance stay unchanged as the existing I-META table/JSON encoding logic.
- BMEF and SMEA are upload-only tabs and never become manual form tables.
- Header progress badges are always visible and reactive:
  - `BMEF: Submitted ✅` or `BMEF: Not Submitted ❌`
  - `SMEA: Submitted ✅` or `SMEA: Not Submitted ❌`
- Upload status updates after upload, replace, refresh, and submission reload.

## FileUploadField Standard

Use one reusable upload card component for both BMEF and SMEA.

Required behavior:

- Shows status badge (`Submitted` or `Not Submitted`)
- Shows file metadata when present:
  - filename
  - size
  - uploaded timestamp
- Supports `Replace` action
- Supports `Download` action
- Shows dashed drop-zone card when no file exists
- Enforces accepted formats and size constraints from API contract

Recommended accepted formats and constraints:

- `.pdf`, `.docx`, `.xlsx`
- `max: 10MB`

## Monitor Experience

Monitor review surfaces must align to the same package terminology.

- Keep I-META review unchanged for indicator checks.
- Replace legacy document labels with BMEF labels in drawers, tabs, badges, and cards.
- Provide dedicated BMEF and SMEA document tabs in review details.
- Each document tab shows:
  - submission status
  - filename
  - uploaded timestamp
  - download action
  - review notes context

## Data Model and Storage

Single table strategy remains in `indicator_submissions`.

Core payload split:

- `form_data` => I-META JSON
- BMEF file metadata => backend fields/storage mapping
- SMEA file metadata => backend fields/storage mapping

Private file storage convention:

- Disk: private/local
- Folder: `storage/app/private/submissions/`
- Naming pattern: `{school_id}_{academic_year}_{type}_{timestamp}.{ext}`

## API Contract (Upload and Download)

Upload endpoint:

- `POST /api/submissions/{submission_id}/upload-file`
- multipart form fields:
  - `type`: `bmef` or `smea`
  - `file`: binary

Download endpoint:

- `GET /api/submissions/{submission_id}/download/{type}`
- `type`: `bmef` or `smea`

Authorization:

- School head: upload/replace own school package files.
- Division monitor: read-only document download across scoped submissions.

## Completion Logic

A submission package is complete only when all are true:

- I-META form data exists (`form_data` / indicator items saved)
- BMEF file exists
- SMEA file exists

This completion state powers:

- submit enablement
- status badges
- queue readiness

## UI Consistency Checklist

- Use CSPAMS card language (`rounded-2xl`, bordered surfaces, subtle shadows).
- Keep I-META editing and upload-only tabs visually separate.
- Avoid any full student information management behavior inside compliance package tabs.
- Keep monitor actions (`validate`, `return`) unchanged.

## Migration Notes

- UI name changed to `BMEF`.
- Existing backend columns and historical identifiers that reference `targets_met` remain valid and supported.
- No schema break is required for the naming refactor; this is primarily a UX and labeling standardization.
