import crypto from "crypto";

const keyHex = process.env.ENCRYPTION_KEY;
if (!keyHex) {
  throw new Error(
    "[Verify COD Orders] La variable de entorno ENCRYPTION_KEY no está definida. Por favor, agrégala a tu archivo .env. Debe ser una cadena hexadecimal de 64 caracteres (32 bytes)."
  );
}
const ENCRYPTION_KEY = Buffer.from(keyHex, "hex"); // 32 bytes (256 bits)
const ALGORITHM = "aes-256-gcm";

export function encryptToken(token: string): { encrypted: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(12); // 12 bytes para GCM
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  cipher.setAAD(Buffer.from("whatsapp-token", "utf8"));

  let encrypted = cipher.update(token, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
  };
}

export function decryptToken(encryptedData: { encrypted: string; iv: string; tag: string }): string {
  const iv = Buffer.from(encryptedData.iv, "hex");
  const tag = Buffer.from(encryptedData.tag, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAAD(Buffer.from("whatsapp-token", "utf8"));
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encryptedData.encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
} 