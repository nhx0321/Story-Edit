import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

type VerifyMode = 'fresh' | 'upgrade';
type CheckResult = {
  name: string;
  ok: boolean;
  details: string;
};

const DEFAULT_DATABASE_URL = 'postgresql://story_edit:story_edit_dev@localhost:5432/story_edit';
const VALID_MODES = new Set<VerifyMode>(['fresh', 'upgrade']);

function getMode(): VerifyMode {
  const arg = process.argv.find(value => value.startsWith('--mode='));
  const mode = arg?.split('=')[1] as VerifyMode | undefined;
  if (!mode || !VALID_MODES.has(mode)) {
    throw new Error('必须通过 --mode=fresh 或 --mode=upgrade 指定验证模式');
  }
  return mode;
}

function redactDatabaseUrl(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const auth = url.username ? `${decodeURIComponent(url.username)}@` : '';
    return `${url.protocol}//${auth}${url.hostname}:${url.port}${url.pathname}`;
  } catch {
    return '<invalid DATABASE_URL>';
  }
}

async function readJournalDrift(repoRoot: string): Promise<{ warning?: string; latestJournalTag?: string; latestSqlTag?: string }> {
  const journalPath = path.join(repoRoot, 'src', 'db', 'migrations', 'meta', '_journal.json');
  const migrationsDir = path.join(repoRoot, 'src', 'db', 'migrations');

  const journalRaw = await fs.readFile(journalPath, 'utf8');
  const journal = JSON.parse(journalRaw) as { entries?: Array<{ tag?: string }> };
  const entries = journal.entries ?? [];
  const latestJournalTag = entries.at(-1)?.tag;

  const migrationFiles = (await fs.readdir(migrationsDir))
    .filter(name => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
  const latestSqlTag = migrationFiles.at(-1)?.replace(/\.sql$/, '');

  if (!latestJournalTag || !latestSqlTag) {
    return {};
  }

  if (latestJournalTag !== latestSqlTag) {
    return {
      latestJournalTag,
      latestSqlTag,
      warning: `migration journal 已漂移：journal 末端为 ${latestJournalTag}，目录末端为 ${latestSqlTag}。原生 drizzle-kit migrate 不再可信，当前脚本仅执行 canonical 状态核查。`,
    };
  }

  return { latestJournalTag, latestSqlTag };
}

async function main() {
  const mode = getMode();
  const connectionString = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  const connectionSource = process.env.DATABASE_URL ? 'env' : 'default-fallback';
  const sql = postgres(connectionString, { max: 1, prepare: false });
  const checks: CheckResult[] = [];
  const warnings: string[] = [];
  const repoRoot = path.resolve(__dirname, '..', '..');

  const pushCheck = (name: string, ok: boolean, details: string) => {
    checks.push({ name, ok, details });
    const icon = ok ? '✅' : '❌';
    console.log(`${icon} ${name}: ${details}`);
  };

  try {
    console.log(`开始执行数据库验证（mode=${mode}）`);
    console.log(`连接目标：${redactDatabaseUrl(connectionString)}`);
    console.log(`连接来源：${connectionSource}`);

    if (connectionSource === 'default-fallback') {
      warnings.push('当前未显式设置 DATABASE_URL，正在使用 drizzle.config.ts 的本地默认库。');
    }

    const journalDrift = await readJournalDrift(repoRoot);
    if (journalDrift.warning) {
      warnings.push(journalDrift.warning);
    }

    const drizzleMigrationsTable = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = '__drizzle_migrations'
      ) AS exists
    `;
    if (!drizzleMigrationsTable[0]?.exists) {
      warnings.push('数据库中不存在 public.__drizzle_migrations，无法依赖数据库内部历史记录判断旧迁移执行顺序。');
    }

    const requiredTables = [
      'content_fingerprints',
      'ai_configs',
      'model_pricing',
      'token_consumption_logs',
      'user_sprites',
      'sprite_bean_transactions',
      'recharge_orders',
      'subscriptions',
    ];

    for (const tableName of requiredTables) {
      const rows = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ${tableName}
        ) AS exists
      `;
      pushCheck(`表存在: ${tableName}`, !!rows[0]?.exists, rows[0]?.exists ? '存在' : '缺失');
    }

    const requiredColumns = [
      { table: 'content_fingerprints', column: 'fingerprint_dec', expected: 'bigint' },
      { table: 'model_pricing', column: 'input_price_per_1m', expected: 'bigint' },
      { table: 'model_pricing', column: 'output_price_per_1m', expected: 'bigint' },
      { table: 'token_consumption_logs', column: 'input_tokens', expected: 'bigint' },
      { table: 'token_consumption_logs', column: 'output_tokens', expected: 'bigint' },
      { table: 'token_consumption_logs', column: 'cache_hit_tokens', expected: 'bigint' },
      { table: 'ai_configs', column: 'is_default', expected: 'boolean' },
      { table: 'user_sprites', column: 'bonus_days', expected: 'integer' },
      { table: 'user_sprites', column: 'converted_days', expected: 'integer' },
      { table: 'sprite_bean_transactions', column: 'amount', expected: 'integer' },
      { table: 'recharge_orders', column: 'bean_amount', expected: 'integer' },
      { table: 'subscriptions', column: 'current_period_end', expected: 'timestamp without time zone' },
    ];

    for (const target of requiredColumns) {
      const rows = await sql<{ data_type: string }[]>`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${target.table}
          AND column_name = ${target.column}
      `;
      const actual = rows[0]?.data_type;
      pushCheck(
        `列类型: ${target.table}.${target.column}`,
        actual === target.expected,
        actual ? `实际=${actual}，期望=${target.expected}` : '列缺失',
      );
    }

    const contentFingerprintConstraint = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'content_fingerprints_template_id_unique'
      ) AS exists
    `;
    pushCheck(
      'content_fingerprints 唯一约束',
      !!contentFingerprintConstraint[0]?.exists,
      contentFingerprintConstraint[0]?.exists ? 'content_fingerprints_template_id_unique 存在' : '唯一约束缺失',
    );

    const aiDefaultIndex = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'idx_ai_configs_one_default_per_user'
      ) AS exists
    `;
    pushCheck(
      'ai_configs 默认项唯一索引',
      !!aiDefaultIndex[0]?.exists,
      aiDefaultIndex[0]?.exists ? 'idx_ai_configs_one_default_per_user 存在' : '索引缺失',
    );

    const aiDefaultFunction = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_proc
        WHERE proname = 'enforce_single_default_config'
      ) AS exists
    `;
    pushCheck(
      'ai_configs 默认项触发器函数',
      !!aiDefaultFunction[0]?.exists,
      aiDefaultFunction[0]?.exists ? 'enforce_single_default_config 存在' : '触发器函数缺失',
    );

    const aiDefaultTrigger = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_trigger trigger
        JOIN pg_class table_ref ON table_ref.oid = trigger.tgrelid
        WHERE trigger.tgname = 'trg_enforce_single_default'
          AND table_ref.relname = 'ai_configs'
          AND NOT trigger.tgisinternal
      ) AS exists
    `;
    pushCheck(
      'ai_configs 默认项触发器',
      !!aiDefaultTrigger[0]?.exists,
      aiDefaultTrigger[0]?.exists ? 'trg_enforce_single_default 存在' : '触发器缺失',
    );

    const duplicateDefaults = await sql<{ user_id: string; default_count: number }[]>`
      SELECT user_id, COUNT(*)::int AS default_count
      FROM ai_configs
      WHERE is_default = true
      GROUP BY user_id
      HAVING COUNT(*) > 1
      LIMIT 5
    `;
    pushCheck(
      'ai_configs 默认项唯一性数据检查',
      duplicateDefaults.length === 0,
      duplicateDefaults.length === 0 ? '未发现同一用户多条默认配置' : `发现 ${duplicateDefaults.length} 个用户存在重复默认配置`,
    );

    const activeSubscriptionWithoutBonus = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM subscriptions subscription
      LEFT JOIN user_sprites sprite ON sprite.user_id = subscription.user_id
      WHERE subscription.status = 'premium'
        AND subscription.current_period_end IS NOT NULL
        AND subscription.current_period_end > NOW()
        AND COALESCE(sprite.bonus_days, 0) <= 0
    `;

    const inactiveSubscriptionWithBonus = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM subscriptions subscription
      JOIN user_sprites sprite ON sprite.user_id = subscription.user_id
      WHERE (subscription.current_period_end IS NULL OR subscription.current_period_end <= NOW() OR subscription.status <> 'premium')
        AND COALESCE(sprite.bonus_days, 0) > 0
    `;

    const missingBonusCount = activeSubscriptionWithoutBonus[0]?.count ?? 0;
    const staleBonusCount = inactiveSubscriptionWithBonus[0]?.count ?? 0;

    if (missingBonusCount > 0) {
      warnings.push(`检测到 ${missingBonusCount} 条“订阅有效但 bonus_days <= 0”的记录，需要人工核查 subscriptions 与 user_sprites 的同步状态。`);
    }
    if (staleBonusCount > 0) {
      warnings.push(`检测到 ${staleBonusCount} 条“订阅失效但 bonus_days 仍大于 0”的记录，需要人工核查历史 VIP 数据冻结策略。`);
    }

    console.log('');
    console.log('验证摘要');
    console.log(`- 成功检查：${checks.filter(item => item.ok).length}`);
    console.log(`- 失败检查：${checks.filter(item => !item.ok).length}`);
    console.log(`- 警告：${warnings.length}`);

    if (warnings.length > 0) {
      console.log('');
      console.log('警告列表');
      for (const warning of warnings) {
        console.log(`⚠️ ${warning}`);
      }
    }

    const failedChecks = checks.filter(item => !item.ok);
    if (failedChecks.length > 0) {
      process.exitCode = 1;
      return;
    }

    console.log('');
    console.log(`数据库验证通过（mode=${mode}）。`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch(error => {
  console.error('数据库验证脚本执行失败');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
