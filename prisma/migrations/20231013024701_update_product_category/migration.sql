/*
  Warnings:

  - The primary key for the `Category` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Category` table. All the data in the column will be lost.
  - Added the required column `categoryId` to the `Category` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `ProductCategory` DROP FOREIGN KEY `ProductCategory_CategoryId_fkey`;

-- AlterTable
ALTER TABLE `Category` DROP PRIMARY KEY,
    DROP COLUMN `id`,
    ADD COLUMN `categoryId` INTEGER NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`categoryId`);

-- AddForeignKey
ALTER TABLE `ProductCategory` ADD CONSTRAINT `ProductCategory_CategoryId_fkey` FOREIGN KEY (`CategoryId`) REFERENCES `Category`(`categoryId`) ON DELETE CASCADE ON UPDATE CASCADE;
