import { Role } from '@prisma/client';

// Shape of data yang di-encode ke dalam JWT token
export interface JwtPayload {
  sub: string; // user.id (UUID)
  email: string;
  role: Role;
  region_id: string | null;
}

// Shape setelah JWT di-decode & di-attach ke request
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  region_id: string | null;
}
