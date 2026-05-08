import { db } from '@/db/db';
import type { VideoFile } from '@/models/File';
import type { LibraryRoot } from '@/models/Library';
import { fileAPI, libraryRootAPI } from './storage';

export async function requestLibraryRoot(): Promise<LibraryRoot> {
  if (!window.showDirectoryPicker) {
    throw new Error('当前浏览器不支持 File System Access API，请使用 Chrome/Edge 等浏览器');
  }

  const handle = await window.showDirectoryPicker();
  const now = new Date();
  const existingRoots = await libraryRootAPI.getAll();
  const existingRoot = (
    await Promise.all(
      existingRoots.map(async (root) => {
        try {
          return (await root.handle.isSameEntry(handle)) ? root : null;
        } catch {
          return null;
        }
      }),
    )
  ).find((root): root is LibraryRoot => Boolean(root));

  if (existingRoot) {
    const updatedRoot: LibraryRoot = {
      ...existingRoot,
      name: handle.name,
      handle,
      updated_at: now,
      last_granted_at: now,
    };
    await libraryRootAPI.update(existingRoot.id, {
      name: handle.name,
      handle,
      last_granted_at: now,
    });
    await db.dirHandle.put({ id: existingRoot.id, handle });
    return updatedRoot;
  }

  const root: LibraryRoot = {
    id: crypto.randomUUID(),
    name: handle.name,
    handle,
    created_at: now,
    updated_at: now,
    last_granted_at: now,
  };

  await libraryRootAPI.add(root);
  await db.dirHandle.put({ id: root.id, handle });
  return root;
}

export async function getLibraryRoots() {
  return libraryRootAPI.getAll();
}

export async function ensureReadPermission(handle: FileSystemDirectoryHandle) {
  const current = await handle.queryPermission({ mode: 'read' });
  if (current === 'granted') return;

  const requested = await handle.requestPermission({ mode: 'read' });
  if (requested !== 'granted') {
    throw new Error('需要重新授权媒体目录后才能继续');
  }
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function concatenateBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const totalLength = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const result = new Uint8Array(totalLength);
  
  let offset = 0;
  for (const buffer of buffers) {
    result.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  
  return result.buffer;
}

// 快速采样哈希（<100ms）
async function computeQuickHash(file: File): Promise<string> {
  const sampleSize = 65536; // 64KB
  
  // 取 4 个样本点：头部、1/3、2/3、尾部
  const offsets = [
    0,
    Math.floor(file.size / 3),
    Math.floor(file.size * 2 / 3),
    Math.max(0, file.size - sampleSize)
  ];
  
  const chunks = await Promise.all(
    offsets.map(async (offset) => {
      const end = Math.min(offset + sampleSize, file.size);
      const slice = file.slice(offset, end);
      return slice.arrayBuffer();
    })
  );
  
  // 组合哈希
  const hash = await crypto.subtle.digest('SHA-256', concatenateBuffers(chunks));
  return arrayBufferToHex(hash);
}

// 扫描视频文件
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'];

async function isVideoFile(fileHandle: FileSystemFileHandle) {
  const name = fileHandle.name;
  return VIDEO_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext));
}

async function scanDirectory(dirHandle: FileSystemDirectoryHandle, relativePath = ''): Promise<{ handle: FileSystemFileHandle; name: string; path: string; parentPath: string }[]> {
  const files = [];
  for await (const [name, handle] of dirHandle.entries()) {
    const currentPath = relativePath ? `${relativePath}/${name}` : name;
    if (handle.kind === 'file') {
      if (await isVideoFile(handle as FileSystemFileHandle)) {
        files.push({
          handle: handle,
          name,
          path: currentPath,
          parentPath: relativePath,
        });
      }
    } else if (handle.kind === 'directory') {
      const subFiles = await scanDirectory(handle as FileSystemDirectoryHandle, currentPath);
      files.push(...subFiles);
    }
  }
  return files;
}

export async function scanLibraryRoot(root: LibraryRoot) {
  await ensureReadPermission(root.handle);

  const files = await scanDirectory(root.handle);
  const now = Date.now();

  const existingFiles = await fileAPI.getByRootId(root.id);
  const existingByIdentity = new Map(existingFiles.map(f => [`${f.size}:${f.quickHash}`, f]));
  const existingByPath = new Map(existingFiles.map(f => [f.path, f]));

  const toAdd: VideoFile[] = [];
  const toUpdate: VideoFile[] = [];
  const processedIdentities = new Set<string>();
  const processedIds = new Set<string>();

  for (const { handle, name, path, parentPath } of files) {
    const file = await handle.getFile();
    const quickHash = await computeQuickHash(file);
    const identity = `${file.size}:${quickHash}`;

    if (processedIdentities.has(identity)) {
      console.warn(`重复文件跳过: ${path} (本次扫描中存在文件的采样哈希相同)`);
      continue;
    }
    processedIdentities.add(identity);

    const existing = existingByIdentity.get(identity) ?? existingByPath.get(path);

    if (existing) {
      const updated: VideoFile = {
        ...existing,
        root_id: root.id,
        name,
        path,
        parent_path: parentPath,
        ext: name.split('.').pop()?.toLowerCase() || '',
        size: file.size,
        modified: file.lastModified,
        quickHash,
        scan_state: 'active',
        last_seen_at: now,
        lastScan: now,
      };
      toUpdate.push(updated);
      processedIds.add(existing.id);
    } else {
      toAdd.push({
        id: crypto.randomUUID(),
        root_id: root.id,
        name,
        path,
        parent_path: parentPath,
        ext: name.split('.').pop()?.toLowerCase() || '',
        size: file.size,
        modified: file.lastModified,
        quickHash,
        scan_state: 'active',
        last_seen_at: now,
        lastScan: now,
      });
    }
  }

  const missing = existingFiles.filter(f => !processedIds.has(f.id) && !processedIdentities.has(`${f.size}:${f.quickHash}`));

  await fileAPI.add(toAdd);
  await fileAPI.update(toUpdate);
  await fileAPI.markMissing(missing);
  await libraryRootAPI.update(root.id, { last_scanned_at: new Date() });

  return {
    root,
    files: [...toAdd, ...toUpdate],
    added: toAdd.length,
    updated: toUpdate.length,
    missing: missing.length,
  };
}
