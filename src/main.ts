import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // 환경 변수에서 PORT를 읽어오거나, 없다면 serverless-offline의 기본 포트인 3002를 사용합니다.
  const port = process.env.PORT || 3002;

  const app = await NestFactory.create(AppModule);
  await app.listen(port);

  console.log(`Application is running on: ${await app.getUrl()}`);
}

bootstrap();
