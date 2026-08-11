-- Existing transfer records contain only new-shuttle quantities.
ALTER TABLE "ShuttleTransfer"
ADD COLUMN "semiTubeCount" DOUBLE PRECISION NOT NULL DEFAULT 0;
