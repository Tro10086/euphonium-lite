import { db } from '@/db/db'
import {
  EXPORT_SCHEMA_VERSION,
  type EuphoniumExportData,
  type ExportedAttachmentManifestItem,
  type ImportMergeOptions,
  type ImportMergeResult,
  type ImportValidationResult,
  type Note,
} from '@/models/Note'
import { attachmentAPI, notesAPI } from './notes'

const exportDataKeys = [
  'anime',
  'episodes',
  'files',
  'matches',
  'libraryRoots',
  'notes',
  'attachments',
] as const
type ExportDataKey = (typeof exportDataKeys)[number]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isExportData(value: unknown): value is EuphoniumExportData {
  if (!isRecord(value)) return false
  if (value.schemaVersion !== EXPORT_SCHEMA_VERSION) return false
  if (value.app !== 'euphonium-lite') return false
  if (typeof value.exportedAt !== 'string') return false
  const data = value.data
  if (!isRecord(data)) return false

  return exportDataKeys.every((key) => Array.isArray(data[key]))
}

function countExportData(data: EuphoniumExportData['data']): Record<ExportDataKey, number> {
  return {
    anime: data.anime.length,
    episodes: data.episodes.length,
    files: data.files.length,
    matches: data.matches.length,
    libraryRoots: data.libraryRoots.length,
    notes: data.notes.length,
    attachments: data.attachments.length,
  }
}

function restoreDateFields<T extends Record<string, unknown>>(
  item: T,
  fields: Array<keyof T>,
): T {
  const restored = { ...item }
  for (const field of fields) {
    const value = restored[field]
    if (typeof value === 'string') restored[field] = new Date(value) as T[keyof T]
  }
  return restored
}

function normalizeImportedData(data: EuphoniumExportData): EuphoniumExportData {
  return {
    ...data,
    data: {
      anime: data.data.anime.map((item) =>
        restoreDateFields(item as unknown as Record<string, unknown>, [
          'created_at',
          'updated_at',
          'last_watched_at',
          'deleted_at',
          'purge_requested_at',
        ]),
      ) as unknown as EuphoniumExportData['data']['anime'],
      episodes: data.data.episodes.map((item) =>
        restoreDateFields(item as unknown as Record<string, unknown>, [
          'created_at',
          'updated_at',
          'watched_at',
        ]),
      ) as unknown as EuphoniumExportData['data']['episodes'],
      files: data.data.files,
      matches: data.data.matches.map((item) =>
        restoreDateFields(item as unknown as Record<string, unknown>, ['created_at', 'updated_at']),
      ) as unknown as EuphoniumExportData['data']['matches'],
      libraryRoots: data.data.libraryRoots.map((item) =>
        restoreDateFields(item as unknown as Record<string, unknown>, [
          'created_at',
          'updated_at',
          'last_scanned_at',
        ]),
      ) as unknown as EuphoniumExportData['data']['libraryRoots'],
      notes: data.data.notes.map((item) =>
        restoreDateFields(item as unknown as Record<string, unknown>, ['created_at', 'updated_at']),
      ) as unknown as Note[],
      attachments: data.data.attachments,
    },
  }
}

async function filterExistingById<T extends { id: string }>(
  items: T[],
  exists: (id: string) => Promise<unknown>,
) {
  const kept: T[] = []
  const skipped: T[] = []

  for (const item of items) {
    if (await exists(item.id)) skipped.push(item)
    else kept.push(item)
  }

  return { kept, skipped }
}

async function filterExistingMatches<T extends { keyword: string }>(items: T[]) {
  const kept: T[] = []
  const skipped: T[] = []

  for (const item of items) {
    const key = 'folder_key' in item && typeof item.folder_key === 'string' ? item.folder_key : item.keyword
    if ((await db.match.get(key)) ?? (await db.match.where('folder_key').equals(key).first())) skipped.push(item)
    else kept.push(item)
  }

  return { kept, skipped }
}

export async function createExportData(): Promise<EuphoniumExportData> {
  const [anime, episodes, files, matches, libraryRoots, notes, attachmentMetadata] = await Promise.all([
    db.anime.toArray(),
    db.episodes.toArray(),
    db.files.toArray(),
    db.match.toArray(),
    db.libraryRoots.toArray(),
    notesAPI.getAll(),
    attachmentAPI.getAllMetadata(),
  ])

  const attachments: ExportedAttachmentManifestItem[] = attachmentMetadata.map((attachment) => ({
    ...attachment,
    included: false,
    reason: 'zip-export-not-enabled',
  }))

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'euphonium-lite',
    data: {
      anime,
      episodes,
      files,
      matches,
      libraryRoots: libraryRoots.map(({ handle: _handle, ...root }) => root),
      notes,
      attachments,
    },
  }
}

export function serializeExportData(data: EuphoniumExportData): string {
  return JSON.stringify(data, null, 2)
}

export async function createExportJson(): Promise<string> {
  return serializeExportData(await createExportData())
}

export function parseExportJson(json: string): unknown {
  return JSON.parse(json)
}

export function validateImportData(value: unknown): ImportValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!isRecord(value)) {
    return { ok: false, errors: ['Import payload must be an object.'], warnings }
  }

  const schemaVersion =
    typeof value.schemaVersion === 'number' ? value.schemaVersion : undefined

  if (schemaVersion !== EXPORT_SCHEMA_VERSION) {
    errors.push(`Unsupported schemaVersion: ${String(value.schemaVersion)}.`)
  }

  if (value.app !== 'euphonium-lite') errors.push('Import payload app must be euphonium-lite.')
  if (!isRecord(value.data)) errors.push('Import payload data must be an object.')

  if (!isExportData(value)) {
    if (isRecord(value.data)) {
      for (const key of exportDataKeys) {
        if (!Array.isArray(value.data[key])) errors.push(`data.${key} must be an array.`)
      }
    }

    return {
      ok: false,
      errors,
      warnings,
      ...(schemaVersion !== undefined ? { schemaVersion } : {}),
    }
  }

  if (value.data.attachments.length > 0) {
    warnings.push('Attachment blobs are not included in JSON export; only metadata can be imported.')
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    ...(schemaVersion !== undefined ? { schemaVersion } : {}),
    counts: countExportData(value.data),
  }
}

export async function importExportData(
  payload: string | unknown,
  options: ImportMergeOptions = {},
): Promise<ImportMergeResult> {
  const dryRun = options.dryRun ?? true
  let raw: unknown

  try {
    raw = typeof payload === 'string' ? parseExportJson(payload) : payload
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : 'Invalid JSON import payload.'],
      warnings: [],
      dryRun,
      merged: {},
      skipped: {},
    }
  }

  const validation = validateImportData(raw)
  const conflictStrategy = options.conflictStrategy ?? 'skip'

  const result: ImportMergeResult = {
    ...validation,
    dryRun,
    merged: {},
    skipped: {},
  }

  if (!validation.ok || !isExportData(raw)) return result

  const normalized = normalizeImportedData(raw)
  const { data } = normalized

  let anime = data.anime
  let episodes = data.episodes
  let files = data.files
  let matches = data.matches
  let notes = data.notes

  if (conflictStrategy === 'skip') {
    const animeFiltered = await filterExistingById(anime, (id) => db.anime.get(id))
    const episodeFiltered = await filterExistingById(episodes, (id) => db.episodes.get(id))
    const fileFiltered = await filterExistingById(files, (id) => db.files.get(id))
    const matchFiltered = await filterExistingMatches(matches)
    const noteFiltered = await filterExistingById(notes, (id) => notesAPI.getById(id))

    anime = animeFiltered.kept
    episodes = episodeFiltered.kept
    files = fileFiltered.kept
    matches = matchFiltered.kept
    notes = noteFiltered.kept

    result.skipped = {
      anime: animeFiltered.skipped.length,
      episodes: episodeFiltered.skipped.length,
      files: fileFiltered.skipped.length,
      matches: matchFiltered.skipped.length,
      libraryRoots: data.libraryRoots.length,
      notes: noteFiltered.skipped.length,
      attachments: data.attachments.length,
    }
  } else {
    result.skipped = {
      libraryRoots: data.libraryRoots.length,
      attachments: data.attachments.length,
    }
  }

  result.merged = {
    anime: anime.length,
    episodes: episodes.length,
    files: files.length,
    matches: matches.length,
    libraryRoots: 0,
    notes: notes.length,
    attachments: 0,
  }

  if (dryRun) return result

  await db.transaction('rw', [db.anime, db.episodes, db.files, db.match], async () => {
    if (anime.length > 0) await db.anime.bulkPut(anime)
    if (episodes.length > 0) await db.episodes.bulkPut(episodes)
    if (files.length > 0) await db.files.bulkPut(files)
    if (matches.length > 0) await db.match.bulkPut(matches)
  })

  await notesAPI.bulkPut(notes)
  return result
}

export function createExportZipWithAttachments(): Promise<Blob> {
  return Promise.reject(
    new Error('Attachment ZIP export is reserved for a future zip dependency integration.'),
  )
}
