export interface LibraryRoot {
  id: string
  name: string
  handle: FileSystemDirectoryHandle
  created_at: Date
  updated_at: Date
  last_granted_at?: Date
  last_scanned_at?: Date
}

