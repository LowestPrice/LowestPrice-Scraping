// src/app.service.ts
//1. 필요한 모듈과 서비스를 임포트 합니다.
import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { PrismaService } from './prisma.service';
import { Prisma } from '@prisma/client';
import { ScrappingRepository } from './scrapping.repository';

//2. 스크래핑 서비스 클래스를 정의하고, nestjs의 injectable 데코레이터를 사용합니다.
@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private collectedVendorItemIds = new Set<bigint>();

  constructor(
    private readonly prisma: PrismaService,
    readonly scrappingRepository: ScrappingRepository,
  ) {}

  async startScrapping() {
    const urls = [
      { url: 'https://pages.coupang.com/p/84845', category: 'iPad' },
      { url: 'https://pages.coupang.com/p/84871', category: 'MacBook' },
      { url: 'https://pages.coupang.com/p/84872', category: 'Mac' },
      { url: 'https://pages.coupang.com/p/84874', category: 'AirPods' },
    ];
    const urls2 = [
      { url: 'https://pages.coupang.com/p/81915', category: 'iPhone' },
      { url: 'https://pages.coupang.com/p/84873', category: 'AppleWatch' },
    ];

    for (const { url, category } of urls) {
      await this.scrapePage(url, category);
      const randomDelay = Math.floor(Math.random() * (6000 - 3000) + 3000); // 3초 ~ 6초 사이의 랜덤한 시간
      await new Promise((resolve) => setTimeout(resolve, randomDelay));
    }
    // 수정된 부분: scrapePage2에서 반환된 scrapedProducts를 products 배열에 누적
    for (const { url, category } of urls2) {
      await this.scrapePage2(url, category); // 수정됨
      // 수정됨
      const randomDelay = Math.floor(Math.random() * (8000 - 5000) + 5000);
      await new Promise((resolve) => setTimeout(resolve, randomDelay));
    }
  }

  // Carousel 방식의 페이지를 스크래핑하는 메소드입니다.
  async scrapePage2(url: string, category: string) {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1920,1020',
      ],
      defaultViewport: {
        width: 1920,
        height: 1020,
      },
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 279813 });

    let prevHeight = 0;
    let scrollHeight = 0;
    const viewportHeight = 1020;
    let firstScrapedCarouselId: string | null = null; // 첫번째로 스크래핑한 캐러셀의 ID를 저장

    // 전체 페이지를 스크롤하면서 캐러셀 정보 수집
    while (true) {
      prevHeight = await page.evaluate(() => document.body.scrollHeight);
      console.log('페이지 돌린다.');
      scrollHeight += viewportHeight;
      await page.evaluate(`window.scrollTo(0, ${scrollHeight})`);
      await new Promise((r) => setTimeout(r, 3000));
      const newHeight = await page.evaluate(() => document.body.scrollHeight);

      if (newHeight === prevHeight) {
        break;
      }

      const lazyContainers = await page.$$('.lazy-container');
      for (const [lazyIdx, lazyContainer] of lazyContainers.entries()) {
        const lazyContainerId = await lazyContainer.evaluate((el) =>
          el.getAttribute('data-id'),
        );

        // 첫번째로 스크래핑한 캐러셀과 같은 캐러셀을 다시 만나면 반복문을 탈출
        if (
          firstScrapedCarouselId &&
          firstScrapedCarouselId === lazyContainerId
        ) {
          await browser.close(); // 브라우저 닫기 전에 탈출
          return;
        }

        if (!firstScrapedCarouselId) {
          firstScrapedCarouselId = lazyContainerId; // 첫번째로 스크래핑한 캐러셀의 ID 저장
        }

        const carousels = await lazyContainer.$$('.carousel');
        console.log(
          `Found ${carousels.length} carousels in lazyContainer ${lazyIdx + 1}`,
        );

        for (const carousel of carousels) {
          const indexInfo = await carousel.$eval(
            '.carousel-header__nav span',
            (span) => {
              const text = span.textContent || '';
              const match = text.match(/(\d+)\/(\d+)/);
              return match ? Number(match[2]) : 0;
            },
          );

          const totalIndexes = indexInfo;
          console.log(
            `Carousel in lazyContainer ${
              lazyIdx + 1
            } has ${totalIndexes} indexes`,
          );

          const vendorItemSet = new Set<bigint>();

          for (let i = 1; i <= totalIndexes; i++) {
            try {
              const nextButton = await carousel.$(
                '.carousel-contents__nav--next',
              );
              await Promise.all([nextButton?.click()]);
            } catch (error) {
              console.error('Error navigating to next page:', error);
            }

            await new Promise((r) => setTimeout(r, 3000));

            const specificLazyContainer = await page.$(
              `.lazy-container[data-id="${lazyContainerId}"]`,
            );
            const content = await specificLazyContainer?.evaluate(
              (el) => el.outerHTML,
            );
            const $ = cheerio.load(content || '');

            $('.product-unit').each((_, element) => {
              const parentElement = $(element).parent();
              const product = this.extractProductInfo2($, parentElement.get(0));

              if (vendorItemSet.has(BigInt(product.coupangVendorId))) {
                return;
              }

              vendorItemSet.add(BigInt(product.coupangVendorId));
              console.log(product);

              // 여기에서 saveProductInfo를 호출하여 상품 정보를 저장합니다.
              this.scrappingRepository
                .saveProductInfo(product, category)
                .catch((error) => {
                  console.error('Failed to save product:', error);
                });
            });
          }

          console.log(`Total products scraped: ${vendorItemSet.size}`);
        }
      }
    }

    await browser.close();
  }
  private extractProductInfo2(
    $: cheerio.CheerioAPI,
    element: cheerio.Element,
  ): Prisma.ProductCreateInput {
    // 0. realId를 추출합니다.

    // 1. 쿠팡의 고유 ID를 추출합니다.
    const href = $(element).attr('href');
    let CproductId: number | null = null;
    let realId: bigint | null = null;
    if (href) {
      const urlParams = new URLSearchParams(href.split('?')[1]);
      CproductId = parseInt(urlParams.get('itemId') || '', 10);
    }
    if (href) {
      const realIdMatch = href.match(/products\/(\d+)\?/);
      if (realIdMatch && realIdMatch[1]) {
        realId = BigInt(realIdMatch[1]);
      }
    }

    // 2. vendorItemId 추출
    const vendorItemId = parseInt($(element).attr('id') || '', 10);

    // 3. productName, productImage 등은 이전과 동일하게 처리
    const CproductName = $(element)
      .find('.product-unit-info__title')
      .text()
      .trim();

    const CproductImageRaw = $(element)
      .find('.container.pre-defined-ratio img')
      .attr('src');
    // https:가 없으면 추가
    const CproductImage = CproductImageRaw?.startsWith('https:')
      ? CproductImageRaw
      : `https:${CproductImageRaw}`;

    // 6. 할인이 있는 상품의 기본 가격을 가져옵니다.
    let CoriginalPrice = parseInt(
      $(element)
        .find('.discount-price__base-price')
        .text()
        .replace(/[^0-9]/g, ''),
      10,
    );

    // 7. 현재 가격을 가져옵니다. (할인이 있을 때 사용)
    const currentPrice = parseInt(
      $(element)
        .find('.current-price__price strong')
        .text()
        .replace(/[^0-9]/g, ''),
      10,
    );

    // 8. 할인이 없는 상품의 경우, 기본가와 현재 가격을 동일하게 설정합니다.
    if (isNaN(CoriginalPrice)) {
      CoriginalPrice = currentPrice;
    }

    // 9. 카드 할인 정보를 가져옵니다.
    const cardDiscountText = $(element)
      .find('.product-unit-benefit-tag-group__badge span')
      .text();
    let cardDiscount: number | null = null;
    if (cardDiscountText) {
      const match = cardDiscountText.match(/최대 (\d+)% 카드 즉시할인/);
      if (match && match[1]) {
        cardDiscount = parseInt(match[1], 10);
      }
    }

    // 10. 상품의 URL을 가져옵니다.
    // 10. 상품의 URL을 가져옵니다.
    const CproductUrl =
      $(element).find('a').attr('href') ||
      $(element).parent().find('a').attr('href') ||
      '';

    // 12. 품절 여부를 확인합니다.
    // 'product-unit-oos' 클래스가 존재하면 품절된 상품입니다.
    const CisOutOfStock = $(element).find('.product-unit-oos').length > 0;

    // 13. 모든 정보를 객체로 반환합니다.
    return {
      realId,
      coupangItemId: CproductId, // 변경됨
      coupangVendorId: vendorItemId, // 변경됨
      productName: CproductName, // 변경됨
      productImage: CproductImage, // 변경됨
      originalPrice: CoriginalPrice, // 변경됨
      productUrl: CproductUrl, // 변경됨
      isOutOfStock: CisOutOfStock, // 변경됨
      currentPrice, // 변경됨
      cardDiscount, // 변경됨
    };
  }
  private async scrapePage(url: string, category: string) {
    try {
      this.logger.log(
        `스크래핑을 시작합니다. 대상 URL: ${url}, 카테고리: ${category}`,
      );

      // Puppeteer 브라우저를 실행합니다.
      this.logger.log(`Puppeteer 브라우저를 실행합니다.`);
      const browser = await puppeteer
        .launch({
          headless: true,
          dumpio: true,
          executablePath: '/usr/bin/chromium-browser',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process',
          ],
          ignoreDefaultArgs: ['--disable-extensions'],
        })
        .catch((err) => {
          this.logger.error(`Puppeteer 브라우저 실행 실패: ${err.message}`);
          throw err;
        });
      this.logger.log(`Puppeteer 브라우저 실행 완료.`);

      // 새로운 페이지를 엽니다.
      this.logger.log(`새로운 페이지를 엽니다.`);
      const page = await browser.newPage().catch((err) => {
        this.logger.error(`새 페이지 열기 실패: ${err.message}`);
        throw err;
      });
      this.logger.log(`새 페이지 열기 완료.`);

      // 대상 URL로 이동합니다.
      this.logger.log(`대상 URL로 이동합니다.`);
      await page
        .goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 150000,
        })
        .catch((err) => {
          this.logger.error(`대상 URL로 이동 실패: ${err.message}`);
          throw err;
        });
      this.logger.log(`대상 URL로 이동 완료.`);
      let previousHeight: number = 0;
      let loopCount = 0; // 추가: 루프 횟수 제한

      while (loopCount < 10) {
        // 변경: 무한 루프 대신 횟수 제한
        const newHeight: number = await page.evaluate(
          () => document.body.scrollHeight,
        );

        if (newHeight === previousHeight) break;

        previousHeight = newHeight;
        await page.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight),
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const content = await page.content();
        this.logger.log('페이지 컨텐츠 가져오기 완료');

        const $ = cheerio.load(content);
        const productElements = $(
          '.lazy-container.product-list-contents__product-unit:not(.lazy-hidden)',
        ).toArray();

        const newProducts = productElements.map((element) =>
          this.extractProductInfo($, element),
        );

        for (const product of newProducts) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          await this.scrappingRepository.saveProductInfo(product, category);
          await console.log(product);
        }

        loopCount++; // 추가: 루프 횟수 증가
      }

      await browser.close(); // 이동: 브라우저 종료 코드를 while 루프 밖으로 이동
      this.logger.log('브라우저 종료');
    } catch (error) {
      this.logger.error(`스크래핑 실패: ${error.message}`);
      this.logger.error(`스크래핑 실패: ${error.stack}`);
    }
  }
  private extractProductInfo(
    $: cheerio.CheerioAPI,
    element: cheerio.Element,
  ): Prisma.ProductCreateInput {
    // 1. 쿠팡의 고유 ID를 추출합니다.
    const href = $(element).find('a').attr('href');
    let CproductId: number | null = null;
    let realId: bigint | null = null;
    if (href) {
      const realIdMatch = href.match(/products\/(\d+)\?/);
      if (realIdMatch && realIdMatch[1]) {
        realId = BigInt(realIdMatch[1]);
      }
    }
    if (href) {
      const urlParams = new URLSearchParams(href.split('?')[1]);
      CproductId = parseInt(urlParams.get('itemId') || '', 10);
    }

    // 2. vendorItemId 추출
    const vendorItemId = parseInt($(element).find('a').attr('id') || '', 10);

    // 3. vendorItemId가 null이거나 NaN인 경우 로깅
    if (vendorItemId === null || isNaN(vendorItemId)) {
      this.logger.warn('Failed to extract vendorItemId');
    }

    // 4. 상품의 이름을 가져옵니다.
    const CproductName = $(element)
      .find('.product-unit-info__title')
      .text()
      .trim();

    // 5. 상품의 이미지 URL을 가져옵니다.
    const CproductImageRaw = $(element)
      .find('.container.pre-defined-ratio img')
      .attr('src');
    // https:가 없으면 추가
    const CproductImage = CproductImageRaw?.startsWith('https:')
      ? CproductImageRaw
      : `https:${CproductImageRaw}`;
    // 6. 할인이 있는 상품의 기본 가격을 가져옵니다.
    let CoriginalPrice = parseInt(
      $(element)
        .find('.discount-price__base-price')
        .text()
        .replace(/[^0-9]/g, ''),
      10,
    );

    // 7. 현재 가격을 가져옵니다. (할인이 있을 때 사용)
    const currentPrice = parseInt(
      $(element)
        .find('.current-price__price strong')
        .text()
        .replace(/[^0-9]/g, ''),
      10,
    );

    // 8. 할인이 없는 상품의 경우, 기본가와 현재 가격을 동일하게 설정합니다.
    if (isNaN(CoriginalPrice)) {
      CoriginalPrice = currentPrice;
    }

    // 9. 카드 할인 정보를 가져옵니다.
    const cardDiscountText = $(element)
      .find('.product-unit-benefit-tag-group__badge span')
      .text();
    let cardDiscount: number | null = null;
    if (cardDiscountText) {
      const match = cardDiscountText.match(/최대 (\d+)% 카드 즉시할인/);
      if (match && match[1]) {
        cardDiscount = parseInt(match[1], 10);
      }
    }

    // 10. 상품의 URL을 가져옵니다.
    const CproductUrl = $(element).find('a').attr('href');

    // 12. 품절 여부를 확인합니다.
    // 'product-unit-oos' 클래스가 존재하면 품절된 상품입니다.
    const CisOutOfStock = $(element).find('.product-unit-oos').length > 0;

    // 13. 모든 정보를 객체로 반환합니다.
    return {
      realId,
      coupangItemId: CproductId, // 변경됨
      coupangVendorId: vendorItemId, // 변경됨
      productName: CproductName, // 변경됨
      productImage: CproductImage, // 변경됨
      originalPrice: CoriginalPrice, // 변경됨
      productUrl: CproductUrl, // 변경됨
      isOutOfStock: CisOutOfStock, // 변경됨
      currentPrice, // 변경됨
      cardDiscount, // 변경됨
    };
  }
}
