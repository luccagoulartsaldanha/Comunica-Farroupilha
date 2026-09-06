import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const VERSION = "v1";
const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

function derive(password: string, salt: Buffer, length: number, cost = COST, blockSize = BLOCK_SIZE, parallelization = PARALLELIZATION) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, length, { N: cost, r: blockSize, p: parallelization }, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

export async function hashPassword(password: string) {
  if (password.length < 8 || password.length > 256) throw new Error("A senha precisa ter entre 8 e 256 caracteres.");
  const salt = randomBytes(16);
  const derived = await derive(password, salt, KEY_LENGTH);
  return ["scrypt", VERSION, COST, BLOCK_SIZE, PARALLELIZATION, salt.toString("base64url"), derived.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, encoded: string) {
  try {
    const [algorithm, version, costValue, blockValue, parallelValue, saltValue, hashValue, extra] = encoded.split("$");
    if (algorithm !== "scrypt" || version !== VERSION || !saltValue || !hashValue || extra !== undefined) return false;
    const cost = Number(costValue);
    const blockSize = Number(blockValue);
    const parallelization = Number(parallelValue);
    if (cost !== COST || blockSize !== BLOCK_SIZE || parallelization !== PARALLELIZATION) return false;
    const expected = Buffer.from(hashValue, "base64url");
    if (expected.length !== KEY_LENGTH) return false;
    const actual = await derive(password, Buffer.from(saltValue, "base64url"), expected.length, cost, blockSize, parallelization);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
