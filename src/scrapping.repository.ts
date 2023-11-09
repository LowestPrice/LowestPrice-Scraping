// src/scrapping/scrapping.repository.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ScrappingRepository {
  constructor(public readonly prisma: PrismaService) {}
  private readonly logger = new Logger(ScrappingRepository.name);

  public async saveProductInfo(
    product: Prisma.ProductCreateInput,
    category: string,
  ) {
    try {
      // cardDiscount 적용된 currentPrice 계산
      const discountedCurrentPrice = product.cardDiscount
        ? Math.floor(product.currentPrice * (1 - product.cardDiscount / 100))
        : product.currentPrice;

      // discountRate 계산
      const discountRate =
        ((product.originalPrice - discountedCurrentPrice) /
          product.originalPrice) *
        100;

      await this.prisma.$transaction(async (prisma) => {
        const createdProduct = await prisma.product.upsert({
          where: { coupangVendorId: product.coupangVendorId },
          update: {
            ...product,
            currentPrice: discountedCurrentPrice,
            discountRate,
          },
          create: {
            ...product,
            currentPrice: discountedCurrentPrice,
            discountRate,
          },
        });

        await prisma.priceHistory.create({
          data: {
            price: createdProduct.currentPrice,
            ProductId: createdProduct.productId,
          },
        });

        let categoryEntity = await prisma.category.findUnique({
          where: { categoryName: category },
        });

        if (!categoryEntity) {
          this.logger.log(`새로운 카테고리를 만듭니다.`);
          categoryEntity = await prisma.category.create({
            data: { categoryName: category },
          });
        }

        // Check if the relationship already exists
        const existingRelationship = await prisma.productCategory.findFirst({
          where: {
            ProductId: createdProduct.productId,
            CategoryId: categoryEntity.categoryId,
          },
        });

        if (!existingRelationship) {
          // 카테고리가 존재하든, 새로 만들어졌든 이제 ProductCategory에 추가합니다.
          await prisma.productCategory.create({
            data: {
              ProductId: createdProduct.productId,
              CategoryId: categoryEntity.categoryId,
            },
          });
        }
      });
    } catch (error) {
      this.logger.error(`Database Error: ${JSON.stringify(error)}`);
    }
  }
}
