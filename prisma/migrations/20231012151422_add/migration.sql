/*
  Warnings:

  - You are about to drop the column `ProductId` on the `Category` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Category` table. All the data in the column will be lost.
  - You are about to drop the column `cardDiscount` on the `PriceHistory` table. All the data in the column will be lost.
  - You are about to drop the column `discountRate` on the `PriceHistory` table. All the data in the column will be lost.
  - You are about to drop the column `updaedAt` on the `Product` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[categoryName]` on the table `Category` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `categoryName` to the `Category` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `Category` DROP FOREIGN KEY `Category_ProductId_fkey`;

-- AlterTable
ALTER TABLE `Category` DROP COLUMN `ProductId`,
    DROP COLUMN `name`,
    ADD COLUMN `categoryName` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `PriceHistory` DROP COLUMN `cardDiscount`,
    DROP COLUMN `discountRate`;

-- AlterTable
ALTER TABLE `Product` DROP COLUMN `updaedAt`,
    ADD COLUMN `cardDiscount` INTEGER NULL,
    ADD COLUMN `discountRate` INTEGER NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL,
    MODIFY `currentPrice` INTEGER NULL,
    MODIFY `productPartnersUrl` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ProductCategory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ProductId` INTEGER NOT NULL,
    `CategoryId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Category_categoryName_key` ON `Category`(`categoryName`);

-- AddForeignKey
ALTER TABLE `ProductCategory` ADD CONSTRAINT `ProductCategory_ProductId_fkey` FOREIGN KEY (`ProductId`) REFERENCES `Product`(`productId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductCategory` ADD CONSTRAINT `ProductCategory_CategoryId_fkey` FOREIGN KEY (`CategoryId`) REFERENCES `Category`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
