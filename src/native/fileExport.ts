import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Where a file went:
 * - shared: written to the app's Documents and handed to the share sheet (Save to Files, iCloud Drive, AirDrop…)
 * - saved: written to Documents (visible in the Files app under On My iPhone/iPad › The Workbench) but the share sheet was closed
 * - downloaded: web build, the browser downloaded it
 * - failed: nothing was written
 */
export type SaveResult = 'shared' | 'saved' | 'downloaded' | 'failed';

export interface SaveOptions {
  /** `content` is base64 (images); otherwise UTF-8 text. */
  base64?: boolean;
  /** Folder inside Documents, e.g. 'Backups'. */
  folder?: string;
  /** Title for the share sheet. */
  title?: string;
}

/** Keep names Files-friendly: letters, digits, spaces, dot, dash, underscore. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim();
  return cleaned || 'workbench';
}

function browserDownload(filename: string, content: string, mime: string, base64: boolean) {
  let blob: Blob;
  if (base64) {
    const bin = atob(content);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    blob = new Blob([bytes], { type: mime });
  } else {
    blob = new Blob([content], { type: mime });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Save a file the way the platform expects. On iOS a WebView can't download,
 * so the file is written to the app's Documents folder (Files app, via
 * UIFileSharingEnabled) and offered on the share sheet, where "Save to Files"
 * reaches iCloud Drive. On the web it downloads.
 */
export async function saveFile(filename: string, content: string, mime: string, options: SaveOptions = {}): Promise<SaveResult> {
  const name = safeFileName(filename);
  if (!Capacitor.isNativePlatform()) {
    try {
      browserDownload(name, content, mime, !!options.base64);
      return 'downloaded';
    } catch {
      return 'failed';
    }
  }

  let uri: string;
  try {
    const path = options.folder ? `${options.folder}/${name}` : name;
    const res = await Filesystem.writeFile({
      path,
      data: content,
      directory: Directory.Documents,
      recursive: true,
      ...(options.base64 ? {} : { encoding: Encoding.UTF8 }),
    });
    uri = res.uri;
  } catch {
    return 'failed';
  }

  try {
    await Share.share({ title: options.title ?? name, files: [uri], dialogTitle: options.title ?? name });
    return 'shared';
  } catch {
    // Closing the share sheet rejects; the file is still in Documents.
    return 'saved';
  }
}

/** One line for a toast after saving. */
export function saveMessage(result: SaveResult, filename: string): string {
  switch (result) {
    case 'shared': return `Saved “${safeFileName(filename)}”.`;
    case 'saved': return 'Saved to the Files app, in The Workbench folder.';
    case 'downloaded': return `Downloaded “${safeFileName(filename)}”.`;
    default: return 'Could not save the file.';
  }
}
