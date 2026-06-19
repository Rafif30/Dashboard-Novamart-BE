import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class AuthenticatedUserDto {
  @ApiProperty({
    description: 'User UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'User role',
    enum: Role,
    example: 'ADMIN',
  })
  role: Role;

  @ApiProperty({
    description: 'Region ID (nullable, only for ANALYST_REGION)',
    example: '550e8400-e29b-41d4-a716-446655440001',
    nullable: true,
  })
  region_id: string | null;
}

export class RefreshTokenResponseDto {
  @ApiProperty({
    description: 'New JWT access token',
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJyb2xlIjoiQURNSU4iLCJpYXQiOjE3MTYyMzkwMjIsImV4cCI6MTcxNjIzOTYyMn0.abcdef123456',
  })
  access_token: string;

  @ApiProperty({
    description: 'Expiration time in seconds',
    example: 900,
  })
  expires_in: number;
}
