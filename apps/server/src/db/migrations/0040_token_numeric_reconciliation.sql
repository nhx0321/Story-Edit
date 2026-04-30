-- Reconciliation: align token-related numeric columns with schema.ts
-- Current mixed-reality issue:
-- - model_pricing.input_price_per_1m / output_price_per_1m are int4 in DB but bigint in schema
-- - token_consumption_logs.input_tokens / output_tokens / cache_hit_tokens are int4 in DB but bigint in schema

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'model_pricing'
      AND column_name = 'input_price_per_1m'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE model_pricing
      ALTER COLUMN input_price_per_1m TYPE BIGINT USING input_price_per_1m::BIGINT;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'model_pricing'
      AND column_name = 'output_price_per_1m'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE model_pricing
      ALTER COLUMN output_price_per_1m TYPE BIGINT USING output_price_per_1m::BIGINT;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'token_consumption_logs'
      AND column_name = 'input_tokens'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE token_consumption_logs
      ALTER COLUMN input_tokens TYPE BIGINT USING input_tokens::BIGINT;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'token_consumption_logs'
      AND column_name = 'output_tokens'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE token_consumption_logs
      ALTER COLUMN output_tokens TYPE BIGINT USING output_tokens::BIGINT;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'token_consumption_logs'
      AND column_name = 'cache_hit_tokens'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE token_consumption_logs
      ALTER COLUMN cache_hit_tokens TYPE BIGINT USING cache_hit_tokens::BIGINT;
  END IF;
END $$;
