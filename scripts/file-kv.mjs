import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class FileKV {
  constructor(filePath, payload) {
    this.filePath = filePath;
    this.records = new Map();
    this.expirations = new Map();

    const sourceRecords = payload && typeof payload === "object"
      ? payload.records || payload
      : {};
    for (const [key, entry] of Object.entries(sourceRecords || {})) {
      if (entry && typeof entry === "object" && Object.prototype.hasOwnProperty.call(entry, "value")) {
        this.records.set(key, String(entry.value));
        if (entry.expires_at) {
          this.expirations.set(key, Number(entry.expires_at));
        }
      } else {
        this.records.set(key, String(entry));
      }
    }
  }

  static async open(filePath) {
    let payload = { records: {} };
    try {
      payload = JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      if (error && error.code !== "ENOENT") {
        throw error;
      }
    }
    return new FileKV(filePath, payload);
  }

  async get(key) {
    if (this.isExpired(key)) {
      this.records.delete(key);
      this.expirations.delete(key);
      await this.save();
      return null;
    }
    return this.records.has(key) ? this.records.get(key) : null;
  }

  async put(key, value, options = {}) {
    this.records.set(key, String(value));
    if (options && Number.isFinite(Number(options.expirationTtl))) {
      this.expirations.set(key, Math.floor(Date.now() / 1000) + Number(options.expirationTtl));
    } else {
      this.expirations.delete(key);
    }
    await this.save();
  }

  async delete(key) {
    this.records.delete(key);
    this.expirations.delete(key);
    await this.save();
  }

  isExpired(key) {
    const expiresAt = this.expirations.get(key);
    return Number.isFinite(expiresAt) && expiresAt <= Math.floor(Date.now() / 1000);
  }

  toJSON() {
    const records = {};
    for (const [key, value] of this.records.entries()) {
      const expiresAt = this.expirations.get(key);
      records[key] = expiresAt
        ? { value, expires_at: expiresAt }
        : value;
    }
    return {
      version: 1,
      updated_at: new Date().toISOString(),
      records,
    };
  }

  async save() {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(this.toJSON(), null, 2)}\n`, "utf8");
    await rename(tmpPath, this.filePath);
  }
}
