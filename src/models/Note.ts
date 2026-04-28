import type { Anime, Episode } from './Anime'
import type { VideoFile } from './File'
import type { MatchRecord } from './Match'

export const NOTE_SCHEMA_VERSION = 1
export const EXPORT_SCHEMA_VERSION = 1

export type NoteTargetType = 'anime' | 'episode' | 'file' | 'match'

export interface TipTapJSON {
  type?: string
  attrs?: Record<string, unknown>
  content?: TipTapJSON[]
  text?: string
  marks?: Array<{
    type: string
    attrs?: Record<string, unknown>
  }>
  [key: string]: unknown
}

export interface Note {
  id: string
  schemaVersion: typeof NOTE_SCHEMA_VERSION
  targetType: NoteTargetType
  targetId: string
  tiptapJson: TipTapJSON
  plainText: string
  attachmentIds: string[]
  created_at: Date
  updated_at: Date
}

export interface Attachment {
  id: string
  schemaVersion: typeof NOTE_SCHEMA_VERSION
  noteId: string
  name: string
  mimeType: string
  size: number
  blob: Blob
  created_at: Date
}

export type ExportedAttachmentManifestItem = Omit<Attachment, 'blob'> & {
  included: false
  reason: 'zip-export-not-enabled'
}

export interface EuphoniumExportData {
  schemaVersion: typeof EXPORT_SCHEMA_VERSION
  exportedAt: string
  app: 'euphonium-lite'
  data: {
    anime: Anime[]
    episodes: Episode[]
    files: VideoFile[]
    matches: MatchRecord[]
    libraryRoots: Array<{
      id: string
      name: string
      created_at: Date
      updated_at: Date
      last_scanned_at?: Date
    }>
    notes: Note[]
    attachments: ExportedAttachmentManifestItem[]
  }
}

export interface ImportValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  schemaVersion?: number
  counts?: Partial<Record<keyof EuphoniumExportData['data'], number>>
}

export interface ImportMergeOptions {
  dryRun?: boolean
  conflictStrategy?: 'skip' | 'overwrite'
}

export interface ImportMergeResult extends ImportValidationResult {
  dryRun: boolean
  merged: Partial<Record<keyof EuphoniumExportData['data'], number>>
  skipped: Partial<Record<keyof EuphoniumExportData['data'], number>>
}
