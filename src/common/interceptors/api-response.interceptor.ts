import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// ============================================================
// ApiResponseInterceptor
//
// Membungkus semua response dengan shape yang konsisten:
//
// SUCCESS:
// {
//   "data": { ...payload },
//   "meta": {
//     "cached_at": "2026-05-27T10:00:00.000Z",
//     "request_id": "abc123"    ← opsional, untuk debugging
//   }
// }
//
// ERROR (ditangani oleh GlobalExceptionFilter, bukan di sini):
// {
//   "error": "NOT_FOUND",
//   "message": "Resource tidak ditemukan",
//   "status": 404
// }
//
// Kenapa penting?
// - Frontend bisa selalu expect `response.data.data` untuk payload
// - `cached_at` berguna untuk debug apakah data dari cache atau DB
// - Kalau shape berubah, cukup ubah satu file ini
// ============================================================

export interface ApiResponse<T> {
  data: T;
  meta: {
    cached_at: string;
  };
}

@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data: T) => ({
        data,
        meta: {
          cached_at: new Date().toISOString(),
        },
      })),
    );
  }
}
