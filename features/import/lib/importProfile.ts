// Generic import-profile seam (Milestone A architecture scaffolding). No
// real institution profile exists yet — no verified column layout for any
// Israeli bank/card exists anywhere in this repo (see the CSV import
// architecture report). This module exists so a future profile can plug in
// via `detect` + `mapRow` alone, without any change to decode/parse/
// preview/dedup/create — every one of those stages already operates on the
// same MappedCsvRow shape a profile produces, identical to what today's
// manual column-mapping UI produces.
//
// Deliberately NOT wired into app/(app)/transactions/import.tsx in this
// milestone: with an empty registry, `detectImportProfile` can never
// return a match, so wiring it into the screen today would only add an
// unreachable branch. The manual mapping UI remains the sole, fully
// functional path. Wiring happens in the milestone that ships the first
// real profile, alongside whatever UI that profile's detection needs
// (e.g. "we recognized this as a Bank X export — review the mapping").

import type { MappedCsvRow } from './mapCsvColumns'

export interface ImportProfile {
  id: string
  displayName: string
  // Returns true if this profile recognizes the file as its known format.
  // Header-text/shape based — never filename or content-sniffing magic.
  detect(headers: readonly string[]): boolean
  // Maps one raw data row (cells in the same order as `headers`) directly
  // to the MappedCsvRow shape the manual mapper already produces, so every
  // downstream stage is unaware whether a row came from a profile or from
  // manual mapping.
  mapRow(row: readonly string[], headers: readonly string[]): MappedCsvRow
}

// Empty by design for Milestone A. Do not add a placeholder/guessed
// profile here — see the CSV import architecture report for why no
// Israeli institution's column layout may be invented.
export const IMPORT_PROFILES: readonly ImportProfile[] = []

export function detectImportProfile(headers: readonly string[]): ImportProfile | null {
  return IMPORT_PROFILES.find((profile) => profile.detect(headers)) ?? null
}
