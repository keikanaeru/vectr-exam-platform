import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

const ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function getEncryptionKey(): Buffer {
  const rawKey = process.env.ACCESS_CODE_ENCRYPTION_KEY;

  if (!rawKey) {
    throw new Error(
      "ACCESS_CODE_ENCRYPTION_KEY belum dikonfigurasi di environment."
    );
  }

  // Mendukung key 64 karakter HEX.
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, "hex");
  }

  // Mendukung key Base64 yang menghasilkan tepat 32 byte.
  try {
    const decoded = Buffer.from(rawKey, "base64");

    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Ditangani oleh error di bawah.
  }

  throw new Error(
    "ACCESS_CODE_ENCRYPTION_KEY harus berupa 32-byte Base64 atau 64 karakter HEX."
  );
}

export function generateAccessCode(): string {
  const makePart = (length: number) => {
    let result = "";

    for (let index = 0; index < length; index += 1) {
      const randomIndex = crypto.randomInt(0, ACCESS_CODE_ALPHABET.length);
      result += ACCESS_CODE_ALPHABET[randomIndex];
    }

    return result;
  };

  return `${makePart(4)}-${makePart(4)}`;
}

export function normalizeAccessCode(value: string): string {
  return value.trim().toUpperCase();
}

export function encryptAccessCode(accessCode: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(normalizeAccessCode(accessCode), "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptAccessCode(ciphertext: string): string {
  const parts = ciphertext.split(":");

  if (parts.length !== 4) {
    throw new Error("Format access code terenkripsi tidak valid.");
  }

  const [version, ivEncoded, authTagEncoded, encryptedEncoded] = parts;

  if (version !== VERSION) {
    throw new Error(`Versi enkripsi access code tidak didukung: ${version}`);
  }

  const key = getEncryptionKey();

  const iv = Buffer.from(ivEncoded, "base64url");
  const authTag = Buffer.from(authTagEncoded, "base64url");
  const encrypted = Buffer.from(encryptedEncoded, "base64url");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}