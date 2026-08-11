// Pure structural CSV parsing — no encoding awareness at all. By the time
// text reaches here it has already been correctly decoded by
// decodeCsvBytes.ts; this file only ever sees a Unicode string.

import Papa from 'papaparse'

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
  })

  const [headers, ...rows] = result.data
  return { headers: headers ?? [], rows }
}
