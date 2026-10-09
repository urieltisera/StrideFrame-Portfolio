import { promises as fs } from "node:fs";
import path from "node:path";

export type StoredFile = { key: string; bytes: Buffer; contentType: string };
export interface StorageProvider {
  putOriginal(file: StoredFile): Promise<void>;
  putPreview(file: StoredFile): Promise<void>;
  deleteOriginal(key: string): Promise<void>;
  deletePreview(key: string): Promise<void>;
  getProtectedOriginal(key: string): Promise<Buffer>;
  createSignedOriginalDownload?(key: string, ttlSeconds: number): Promise<string>;
  getPublicPreviewUrl(key: string): string;
}

function safeKey(key: string) { if (!/^[a-zA-Z0-9._/-]+$/.test(key) || key.includes("..")) throw new Error("Invalid storage key"); return key; }
export class LocalStorageProvider implements StorageProvider {
  private root: string;
  constructor(root = process.env.STORAGE_LOCAL_DIR || path.join(process.cwd(), "storage")) { this.root = path.resolve(root); }
  private file(folder: string, key: string) { return path.join(this.root, folder, safeKey(key)); }
  private async put(folder: string, file: StoredFile) { const target = this.file(folder, file.key); await fs.mkdir(path.dirname(target), { recursive:true }); await fs.writeFile(target, file.bytes, { flag:"wx" }); }
  async putOriginal(file: StoredFile) { return this.put("originals", file); }
  async putPreview(file: StoredFile) { return this.put("previews", file); }
  async deleteOriginal(key: string) { await fs.rm(this.file("originals", key), { force:true }); }
  async deletePreview(key: string) { await fs.rm(this.file("previews", key), { force:true }); }
  async getProtectedOriginal(key: string) { return fs.readFile(this.file("originals", key)); }
  getPublicPreviewUrl(key: string) { return `/api/previews/${key}`; }
}

export const storage = new LocalStorageProvider();
