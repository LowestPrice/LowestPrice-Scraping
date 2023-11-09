import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma.module';
import { ScrappingRepository } from './scrapping.repository';
import { PrismaService } from './prisma.service';

@Module({
  imports: [PrismaModule],
  controllers: [AppController],
  providers: [AppService, ScrappingRepository, PrismaService],
})
export class AppModule {}
