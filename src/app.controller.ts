// Users/adam/scraping-lambda/src/app.controller.ts
import { Controller, Get, Logger } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly scrappingService: AppService) {}
  private readonly logger = new Logger(AppService.name);

  @Get('startScrapping')
  async startScrapping() {
    this.logger.log('Received GET request on /startScrapping');
    try {
      // 스크래핑 로직을 실행합니다.
      const result = await this.scrappingService.startScrapping();

      return result;
    } catch (err) {
      this.logger.log('컨트롤러에서 실패 반환');
    }
  }
}
