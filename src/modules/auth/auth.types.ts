export type RegisterDTO = { email: string; username: string; password: string };
export type LoginDTO = { email: string; password: string };

export type AuthResponseDTO = {
  token: string;
  user: { id: string; email: string; username: string; role: "USER" | "ADMIN" };
};
