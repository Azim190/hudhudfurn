import { type INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppConfig } from './core/config/app-config.service';

export const API_PREFIX = 'api/v1';

/** Shared HTTP setup for main.ts and the e2e tests, so tests exercise the real pipeline. */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfig);
  const express = app as NestExpressApplication;

  if (config.get('TRUST_PROXY')) express.set('trust proxy', 1);
  express.disable('x-powered-by');
  app.use(helmet());
  app.enableCors({
    origin: config.get('CORS_ORIGINS'),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language', 'Idempotency-Key', 'X-Request-Id'],
    maxAge: 600,
  });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, stopAtFirstError: false }),
  );
  app.enableShutdownHooks();

  if (config.get('SWAGGER_ENABLED')) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('HUDHUD API')
        .setDescription(
          'Bilingual e-commerce API. Send `Accept-Language: ar|en` for localized messages. Money is in halalas.',
        )
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, doc, { jsonDocumentUrl: 'docs-json' });
  }
}
