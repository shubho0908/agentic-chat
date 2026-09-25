ALTER TABLE "attachment" ADD COLUMN "kind" VARCHAR(16) NOT NULL DEFAULT 'document';
UPDATE "attachment" SET "kind" = 'image' WHERE lower(split_part("fileType", ';', 1)) LIKE 'image/%';
