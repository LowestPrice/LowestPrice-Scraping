//Users/adam/scraping-lambda/lambda.ts
import { NestFactory } from '@nestjs/core';
import { promises as fsPromises } from 'fs';
import { Logger } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { RequestListener } from 'http';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import express from 'express';

// AWS Lambda와 관련된 타입을 임포트합니다.
import { Context, Handler } from 'aws-lambda';

// 소스 맵 지원을 위해 필요합니다.
require('source-map-support/register');

// AWS Lambda에서 Express 앱을 실행하기 위한 라이브러리입니다.
import { configure as serverlessExpress } from '@vendia/serverless-express';

// Swagger 설정을 위한 모듈을 임포트합니다.
import {
  SwaggerModule,
  DocumentBuilder,
  SwaggerDocumentOptions,
  SwaggerCustomOptions,
} from '@nestjs/swagger';
//src/lambda.ts
// AWS Lambda에서 재사용할 수 있도록 앱 인스턴스를 캐시합니다.
let cachedApp: RequestListener | null = null; // 타입을 RequestListener로 변경

const logger = new Logger('LambdaHandler'); // 전역 로거 설정

// Swagger 설정을 위한 함수입니다.
function setupSwagger(app: INestApplication) {
  logger.log('Setting up Swagger...'); // Swagger 설정 로깅
  const version = process.env.npm_package_version ?? '0.0.0';
  const title = process.env.npm_package_name ?? 'Title';
  const description = process.env.npm_package_description ?? 'Description';
  const config = new DocumentBuilder()
    .setTitle(title)
    .setDescription(description)
    .setVersion(version)
    .build();
  const options: SwaggerDocumentOptions = {
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
  };
  const customOptions: SwaggerCustomOptions = {
    swaggerOptions: {
      persistAuthorization: true,
    },
    customSiteTitle: title,
  };
  const document = SwaggerModule.createDocument(app, config, options);
  SwaggerModule.setup('docs', app, document, customOptions);
}

async function bootstrapServer(): Promise<RequestListener> {
  logger.log('Bootstrapping server...'); // 서버 부트스트래핑 로깅
  if (!cachedApp) {
    try {
      const expressApp = express();
      const nestApp = await NestFactory.create(
        AppModule,
        new ExpressAdapter(expressApp),
        {
          logger: ['error', 'warn', 'debug'],
        },
      );
      setupSwagger(nestApp);
      nestApp.useGlobalPipes(new ValidationPipe());
      nestApp.enableVersioning({ type: VersioningType.URI });
      await nestApp.init();
      cachedApp = expressApp as unknown as RequestListener;
      logger.log('NestJS app bootstrapped successfully.'); // 성공 로깅
    } catch (error) {
      logger.error('Error bootstrapping NestJS app:', error); // 에러 로깅
      throw error;
    }
  } else {
    logger.log('Using cached NestJS app.'); // 캐시 사용 로깅
  }
  return cachedApp;
}

// AWS Lambda 핸들러 함수입니다.
export const handler: Handler = async (event: any, context: Context) => {
  // 람다 핸들러가 호출될 때 로깅
  logger.log('Lambda handler invoked.');

  try {
    // 실행 권한 확인
    const path = '/usr/bin/chromium-browser';
    try {
      await fsPromises.access(path, fsPromises.constants.X_OK);
      logger.log(`Executable permission exists at ${path}`);
    } catch (err) {
      logger.error(`Executable permission does not exist at ${path}`);
      throw new Error(`Executable permission does not exist at ${path}`);
    }
    // 서버 부트스트래핑을 시작하고 로깅
    logger.log('Attempting to bootstrap server...');
    const app = await bootstrapServer();
    logger.log('Server bootstrapped successfully.');

    // serverlessExpress 핸들러를 설정하고 로깅
    logger.log('Setting up serverlessExpress handler...');
    const serverlessExpressHandler = serverlessExpress({ app });
    logger.log('serverlessExpress handler set up successfully.');

    // serverlessExpress 핸들러를 반환
    return serverlessExpressHandler(event, context);
  } catch (error) {
    // 에러 발생 시 로깅
    logger.error('Error in Lambda handler:', error);

    // Prisma 관련 에러인 경우 추가 로깅
    if (error.message && error.message.includes('Prisma')) {
      logger.error('Prisma related error:', error);
    }

    // 에러를 던짐
    throw error;
  }
};
