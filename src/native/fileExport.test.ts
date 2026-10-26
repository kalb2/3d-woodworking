// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = { on: true };
const writeFile = vi.fn();
const share = vi.fn();
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.on } }));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Documents: 'DOCUMENTS' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: { writeFile: (...a: unknown[]) => writeFile(...a) },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: (...a: unknown[]) => share(...a) } }));

const { saveFile, safeFileName, saveMessage } = await import('./fileExport');

beforeEach(() => {
  native.on = true;
  writeFile.mockReset().mockResolvedValue({ uri: 'file:///Documents/Desk.json' });
  share.mockReset().mockResolvedValue({});
});

describe('saveFile on iOS', () => {
  it('writes UTF-8 text to Documents and opens the share sheet with the file', async () => {
    expect(await saveFile('Desk.json', '{}', 'application/json', { title: 'Desk' })).toBe('shared');
    expect(writeFile).toHaveBeenCalledWith({ path: 'Desk.json', data: '{}', directory: 'DOCUMENTS', recursive: true, encoding: 'utf8' });
    expect(share).toHaveBeenCalledWith({ title: 'Desk', files: ['file:///Documents/Desk.json'], dialogTitle: 'Desk' });
  });

  it('base64 images skip the text encoding; folders go under Documents', async () => {
    await saveFile('Desk snapshot.png', 'iVBOR', 'image/png', { base64: true, folder: 'Backups' });
    const arg = writeFile.mock.calls[0][0];
    expect(arg.path).toBe('Backups/Desk snapshot.png');
    expect('encoding' in arg).toBe(false);
  });

  it('closing the share sheet still leaves the file in Files', async () => {
    share.mockRejectedValue(new Error('Share canceled'));
    expect(await saveFile('Desk.json', '{}', 'application/json')).toBe('saved');
  });

  it('a failed write reports failed and never opens the share sheet', async () => {
    writeFile.mockRejectedValue(new Error('disk full'));
    expect(await saveFile('Desk.json', '{}', 'application/json')).toBe('failed');
    expect(share).not.toHaveBeenCalled();
  });
});

describe('saveFile on the web', () => {
  it('downloads through an anchor', async () => {
    native.on = false;
    const create = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await saveFile('Desk.json', '{}', 'application/json')).toBe('downloaded');
    expect(click).toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    click.mockRestore();
  });
});

describe('names and messages', () => {
  it('keeps names Files-friendly', () => {
    expect(safeFileName('Desk: v2/final?.json')).toBe('Desk- v2-final-.json');
    expect(safeFileName('   ')).toBe('workbench');
    expect(saveMessage('saved', 'x')).toMatch(/Files app/);
    expect(saveMessage('failed', 'x')).toBe('Could not save the file.');
  });
});
