import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ─────────────────────────────────────────────
  // SWAGGER SETUP
  // ─────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('Dashboard Novamart API')
    .setDescription(
      'API documentation untuk Dashboard Novamart Backend. Untuk endpoint yang memerlukan autentikasi, gunakan access token di Authorization header (Bearer token).',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Masukkan JWT access token',
      },
      'access-token',
    )
    .addServer('http://localhost:4000', 'Local development')
    .addTag('Auth', 'Authentication endpoints')
    .addTag('Overview', 'Dashboard overview endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayOperationId: true,
    },
  });

  // ─────────────────────────────────────────────
  // COOKIE PARSER
  // Wajib ada agar NestJS bisa baca req.cookies
  // Dibutuhkan oleh JwtRefreshStrategy untuk
  // baca refresh_token dari cookie.
  // ─────────────────────────────────────────────
  app.use(cookieParser());

  // ─────────────────────────────────────────────
  // CORS
  // Izinkan request dari frontend Next.js.
  // credentials: true wajib agar browser mau
  // kirim/terima cookie lintas origin.
  // ─────────────────────────────────────────────
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true, // ← wajib untuk cookie cross-origin
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global: semua error → shape { error, message, status }
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global: semua response → shape { data, meta }
  app.useGlobalInterceptors(new ApiResponseInterceptor());

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
}
bootstrap();
