import { notesDb } from './notes'

export interface CleanupResult {
  scannedNotes: number
  scannedAttachments: number
  orphanBlobs: number
  freedBytes: number
}

export interface StorageEstimate {
  usage: number
  quota: number
}

export async function getStorageEstimate(): Promise<StorageEstimate | null> {
  if (!navigator.storage || !navigator.storage.estimate) return null
  const estimate = await navigator.storage.estimate()
  return {
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
  }
}

export async function scanOrphanAttachments(): Promise<{
  result: CleanupResult
  orphanIds: string[]
}> {
  const allNotes = await notesDb.notes.toArray()
  const allAttachments = await notesDb.attachments.toArray()

  const referencedIds = new Set<string>()
  for (const note of allNotes) {
    for (const id of note.attachmentIds) {
      referencedIds.add(id)
    }
  }

  const orphans = allAttachments.filter((a) => !referencedIds.has(a.id))

  return {
    result: {
      scannedNotes: allNotes.length,
      scannedAttachments: allAttachments.length,
      orphanBlobs: orphans.length,
      freedBytes: orphans.reduce((sum, a) => sum + a.size, 0),
    },
    orphanIds: orphans.map((a) => a.id),
  }
}

export async function cleanupOrphanAttachments(orphanIds: string[]): Promise<void> {
  if (orphanIds.length > 0) {
    await notesDb.attachments.bulkDelete(orphanIds)
  }
}
