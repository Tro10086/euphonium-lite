import JSZip from 'jszip'
import { db } from '@/db/db'
import {
  EXPORT_SCHEMA_VERSION,
  NOTE_SCHEMA_VERSION,
  type EuphoniumExportData,
  type ExportedAttachmentManifestItem,
  type ImportMergeOptions,
  type ImportMergeResult,
  type ImportValidationResult,
  type Note,
  type TipTapJSON,
} from '@/models/Note'
import { attachmentAPI, notesAPI, notesDb } from './notes'
import { animeAPI, episodeAPI } from './storage'
import { rememberAnimeFilterOptionsBulk } from './filterOptions'

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

function restoreDateFields<T extends Record<string, unknown>>(item: T, fields: Array<keyof T>): T {
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
        restoreDateFields(item as unknown as Record<string, unknown>, [
          'created_at',
          'updated_at',
          'deleted_at',
        ]),
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
    const key =
      'folder_key' in item && typeof item.folder_key === 'string' ? item.folder_key : item.keyword
    if ((await db.match.get(key)) ?? (await db.match.where('folder_key').equals(key).first()))
      skipped.push(item)
    else kept.push(item)
  }

  return { kept, skipped }
}

export async function createExportData(): Promise<EuphoniumExportData> {
  const [anime, episodes, files, matches, libraryRoots, notes, attachmentMetadata] =
    await Promise.all([
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

  const schemaVersion = typeof value.schemaVersion === 'number' ? value.schemaVersion : undefined

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
    warnings.push(
      'Attachment blobs are not included in JSON export; only metadata can be imported.',
    )
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

  rememberAnimeFilterOptionsBulk(anime)
  await notesAPI.bulkPut(notes)
  return result
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'note'
}

function buildFolderName(
  note: Note,
  animeMap: Map<string, { id: string; name?: string; name_cn?: string }>,
  episodeMap: Map<string, { id: string; ep?: number; anime_id: string }>,
): string {
  let animeId: string | undefined
  let episodeLabel = '总笔记'

  if (note.targetType === 'anime') {
    animeId = note.targetId
  } else if (note.targetType === 'episode') {
    const episode = episodeMap.get(note.targetId)
    if (episode) {
      animeId = episode.anime_id
      episodeLabel = `第${episode.ep ?? '?'}集`
    }
  }

  const anime = animeId ? animeMap.get(animeId) : undefined
  const animeName = anime?.name_cn || anime?.name || '未知动画'

  return sanitizeFileName(`${animeName}-${episodeLabel}-${note.id.slice(0, 8)}`)
}

function replaceAttachmentPathsForExport(
  text: string,
  attachmentIds: string[],
  attachmentMap: Map<string, { id: string; mimeType: string }>,
): string {
  let result = text
  for (const id of attachmentIds) {
    const att = attachmentMap.get(id)
    if (!att) continue
    const ext = att.mimeType.split('/')[1] || 'bin'
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(
      new RegExp(`\\]\\(attachment:${escapedId}\\)`, 'g'),
      `](images/${id}.${ext})`,
    )
  }
  return result
}

export async function createExportZip(): Promise<Blob> {
  const zip = new JSZip()

  const [allNotes, allAnimes, allEpisodes] = await Promise.all([
    notesAPI.getAllActive(),
    animeAPI.getAll(),
    episodeAPI.getAll(),
  ])

  const animeMap = new Map(allAnimes.map((a) => [a.id, a]))
  const episodeMap = new Map(allEpisodes.map((e) => [e.id, e]))

  const allAttachmentIds = allNotes.flatMap((n) => n.attachmentIds)
  const attachments = await attachmentAPI.getByIds(allAttachmentIds)
  const attachmentMap = new Map(attachments.map((a) => [a.id, a]))

  const notesMeta: Array<{
    id: string
    targetType: string
    targetId: string
    folderName: string
    created_at: string
    updated_at: string
    attachmentIds: string[]
  }> = []

  for (const note of allNotes) {
    const folderName = buildFolderName(note, animeMap, episodeMap)
    const noteFolder = zip.folder(folderName)!
    const imagesFolder = noteFolder.folder('images')!

    const processedText = replaceAttachmentPathsForExport(
      note.plainText,
      note.attachmentIds,
      attachmentMap,
    )

    noteFolder.file('note.md', processedText)

    for (const attId of note.attachmentIds) {
      const att = attachmentMap.get(attId)
      if (att?.blob) {
        const ext = att.mimeType.split('/')[1] || 'bin'
        imagesFolder.file(`${att.id}.${ext}`, att.blob)
      }
    }

    notesMeta.push({
      id: note.id,
      targetType: note.targetType,
      targetId: note.targetId,
      folderName,
      created_at:
        note.created_at instanceof Date
          ? note.created_at.toISOString()
          : String(note.created_at),
      updated_at:
        note.updated_at instanceof Date
          ? note.updated_at.toISOString()
          : String(note.updated_at),
      attachmentIds: note.attachmentIds,
    })
  }

  zip.file(
    'meta.json',
    JSON.stringify(
      {
        schemaVersion: EXPORT_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        app: 'euphonium-lite',
        notes: notesMeta,
      },
      null,
      2,
    ),
  )

  return zip.generateAsync({ type: 'blob' })
}

function textToTipTapJsonForImport(text: string): TipTapJSON {
  return {
    type: 'doc',
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  }
}

function replaceAttachmentPathsForImport(
  text: string,
  idMapping: Map<string, string>,
): string {
  let result = text
  for (const [oldId, newId] of idMapping) {
    const escapedOldId = oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(
      new RegExp(`\\]\\(images/${escapedOldId}\\.\\w+\\)`, 'g'),
      `](attachment:${newId})`,
    )
  }
  return result
}

export async function importNoteZip(
  file: File,
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const zip = await JSZip.loadAsync(file)
  const errors: string[] = []
  let imported = 0
  let skipped = 0

  const metaFile = zip.file('meta.json')
  if (!metaFile) {
    return { imported: 0, skipped: 0, errors: ['meta.json 未找到'] }
  }

  const meta = JSON.parse(await metaFile.async('string'))
  if (meta.schemaVersion !== EXPORT_SCHEMA_VERSION) {
    return {
      imported: 0,
      skipped: 0,
      errors: [`不支持的 schemaVersion: ${meta.schemaVersion}`],
    }
  }
  if (meta.app !== 'euphonium-lite') {
    return { imported: 0, skipped: 0, errors: ['不是 euphonium-lite 导出的文件'] }
  }

  for (const noteMeta of meta.notes) {
    const noteFolder = noteMeta.folderName
    const mdFile = zip.file(`${noteFolder}/note.md`)
    if (!mdFile) {
      skipped++
      continue
    }

    let plainText = await mdFile.async('string')
    const newAttachmentIds: string[] = []
    const idMapping = new Map<string, string>()

    if (noteMeta.attachmentIds.length > 0) {
      const imagesFolder = zip.folder(`${noteFolder}/images`)
      if (imagesFolder) {
        for (const oldId of noteMeta.attachmentIds) {
          const escapedOldId = oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const imageFiles = imagesFolder.file(new RegExp(`^${escapedOldId}\\.`))
          if (imageFiles.length === 0) continue

          const attFile = imageFiles[0]!
          const blob = await attFile.async('blob')
          const ext = attFile.name.split('.').pop() || 'bin'
          const mimeType = blob.type || `image/${ext}`

          const newId = crypto.randomUUID()
          await notesDb.attachments.put({
            id: newId,
            schemaVersion: NOTE_SCHEMA_VERSION,
            noteId: '',
            name: attFile.name,
            mimeType,
            size: blob.size,
            blob,
            created_at: new Date(),
          })

          newAttachmentIds.push(newId)
          idMapping.set(oldId, newId)
        }
      }
    }

    plainText = replaceAttachmentPathsForImport(plainText, idMapping)

    const tiptapJson = textToTipTapJsonForImport(plainText)

    const noteId = crypto.randomUUID()
    const now = new Date()
    await notesDb.notes.put({
      id: noteId,
      schemaVersion: NOTE_SCHEMA_VERSION,
      targetType: noteMeta.targetType,
      targetId: noteMeta.targetId,
      tiptapJson,
      plainText,
      attachmentIds: newAttachmentIds,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    })

    if (newAttachmentIds.length > 0) {
      await notesDb.attachments
        .where('id')
        .anyOf(newAttachmentIds)
        .modify({ noteId })
    }

    imported++
  }

  return { imported, skipped, errors }
}