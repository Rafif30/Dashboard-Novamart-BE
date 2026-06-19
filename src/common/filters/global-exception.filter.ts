import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';

// ============================================================
// GlobalExceptionFilter
//
// Menangkap semua exception dan return error response
// dengan shape yang konsisten:
//
// {
//   "error": "FORBIDDEN",
//   "message": "Role kamu tidak punya akses ke resource ini",
//   "status": 403,
//   "path": "/api/overview/kpis",
//   "timestamp": "2026-05-27T10:00:00.000Z"
// }
// ============================================================

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Terjadi kesalahan pada server';
    let error = 'INTERNAL_SERVER_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) ?? message;
        error = (resp.error as string) ?? HttpStatus[status];
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      // Log server errors
      this.logger.error(
        `Unhandled error: ${exception.message}`,
        exception.stack,
      );
    }

    response.status(status).json({
      error,
      message: Array.isArray(message) ? message.join(', ') : message,
      status,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
