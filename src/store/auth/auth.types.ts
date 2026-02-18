export type AuthUser = {
  email: string;
};

export type AuthSession = {
  user: AuthUser;
  token: string;
  expiresAt: number; // timestamp (ms)
};
