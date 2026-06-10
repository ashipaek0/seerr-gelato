import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImdbIdToMediaRequest1780000000000 implements MigrationInterface {
  name = 'AddImdbIdToMediaRequest1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD "imdbId" varchar(20)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN "imdbId"`
    );
  }
}
