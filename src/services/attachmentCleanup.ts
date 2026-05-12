import { notesDb } from './notes'

export interface CleanupResult {
  scannedNotes: number
  scannedAttachments: number
  orphanBlobs: number
  freedBytes: number
}

export async function scanOrphanAttachments(): Promise<{ result: CleanupResult; orphanIds: string[] }> {
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

export async function cleanupOrphanAttachments(orphanIds: string[]): Promise<CleanupResult> {
  if (orphanIds.length > 0) {
    await notesDb.attachments.bulkDelete(orphanIds)
  }

  return {
    scannedNotes: 0,
    scannedAttachments: 0,
    orphanBlobs: orphanIds.length,
    freedBytes: 0,
  }
}
