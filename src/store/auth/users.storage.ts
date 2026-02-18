type StoredUser = {
  email: string;
  passwordHash: string; // для демо
};

const KEY = "mp_users_v1";

function loadAll(): StoredUser[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredUser[]) : [];
  } catch {
    return [];
  }
}

function saveAll(users: StoredUser[]) {
  localStorage.setItem(KEY, JSON.stringify(users));
}

async function sha256(text: string) {
  const enc = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function registerUser(email: string, password: string) {
  const users = loadAll();
  const exists = users.some((u) => u.email.toLowerCase() === email.toLowerCase());
  if (exists) throw new Error("Користувач з таким email вже існує");

  const passwordHash = await sha256(password);
  users.push({ email, passwordHash });
  saveAll(users);
}

export async function validateUser(email: string, password: string) {
  const users = loadAll();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error("Користувача не знайдено");

  const passwordHash = await sha256(password);
  if (passwordHash !== user.passwordHash) throw new Error("Невірний пароль");

  return { email: user.email };
}
