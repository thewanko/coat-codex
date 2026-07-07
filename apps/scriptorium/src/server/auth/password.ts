// src/server/auth/password.ts — 削除パスワードの PBKDF2-SHA256 ハッシュ/照合（技術計画v1 §4.4・§3.1）
//
// WebCrypto ネイティブ PBKDF2-SHA256 を使用（bcrypt/argon2 等の純JS実装は使わない）。
// 出力形式は seed.mjs のワンオフ実装と厳密一致させる:
//   'pbkdf2-sha256$<iterations>$<saltBase64>$<hashBase64>'
// （base64 は URL-safe ではなく標準 base64）
// iteration 数を自己記述させることで、将来 iterations を変更しても
// 既存ハッシュを検証できる（§8-1）。

const ALGORITHM_ID = "pbkdf2-sha256";
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 32;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array | undefined {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return undefined;
  }
}

async function derivePbkdf2Bits(
  password: string,
  salt: Uint8Array,
  iterations: number,
  lengthBits: number,
): Promise<Uint8Array> {
  const passwordBytes = new TextEncoder().encode(password);
  const key = await crypto.subtle.importKey(
    "raw",
    passwordBytes,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    lengthBits,
  );
  return new Uint8Array(derived);
}

/**
 * 定数時間比較。長さが違う場合のみ早期に false を返す（長さ自体は秘密情報ではない）。
 * 同じ長さの場合は全バイトを XOR して累積し、早期 return せずに最後まで走査する。
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * 削除パスワードを PBKDF2-SHA256 でハッシュ化する。
 * saltOverride はテスト専用の決定化パラメータ（本番コードパスでは渡さない）。
 */
export async function hashDeletePassword(
  password: string,
  saltOverride?: Uint8Array,
): Promise<string> {
  const salt =
    saltOverride ?? crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derivePbkdf2Bits(
    password,
    salt,
    ITERATIONS,
    DERIVED_KEY_BYTES * 8,
  );
  return `${ALGORITHM_ID}$${ITERATIONS}$${toBase64(salt)}$${toBase64(derived)}`;
}

/**
 * stored 形式のハッシュとパスワードを照合する。
 * 不正形式（要素数不足・algo不一致・iter非整数・base64デコード失敗など）は
 * throw せず false を返す。
 */
export async function verifyDeletePassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4) {
    return false;
  }
  const [algo, iterStr, saltB64, hashB64] = parts;
  if (algo !== ALGORITHM_ID) {
    return false;
  }
  if (!/^\d+$/.test(iterStr)) {
    return false;
  }
  const iterations = Number.parseInt(iterStr, 10);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }
  const salt = fromBase64(saltB64);
  const expectedHash = fromBase64(hashB64);
  if (!salt || !expectedHash) {
    return false;
  }

  const derived = await derivePbkdf2Bits(
    password,
    salt,
    iterations,
    expectedHash.length * 8,
  );
  return constantTimeEqual(derived, expectedHash);
}
