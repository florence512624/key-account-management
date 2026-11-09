-- ============================================================
-- KA 大客户销售管理系统 · SQLite 数据库结构
-- ------------------------------------------------------------
-- 设计原则
--   1. 所有子表外键一律 ON DELETE CASCADE：删掉客户 = 连带清空其
--      决策人、跟进记录、待办、AI 分析，不留孤儿数据。
--   2. 决策人引用允许 SET NULL：删除某个联系人不应连带删掉历史
--      沟通纪要（纪要本身属于客户，只是"当时找的是谁"被置空）。
--   3. 枚举值用 CHECK 约束 + 中文注释，前端标签映射放在
--      client/src/lib/constants.js，库里只存稳定英文码。
--   4. 时间统一存本地时间 TEXT（'YYYY-MM-DD HH:MM:SS'），
--      便于 SQLite 的 date() / strftime() 直接做同比环比。
--   5. 常用统计口径沉淀为视图（v_account_overview），
--      看板只做聚合不做业务计算。
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- 1. 客户 Accounts
--    stage      线索 lead / 跟进 following / 谈判 negotiation / 签约 signed
--    scale      规模：大型 / 中型 / 小型
--    health     健康度 0-100，<60 视为高风险（看板第 4 张卡）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL UNIQUE,                 -- 公司名称
  industry         TEXT    NOT NULL DEFAULT '其他',          -- 行业
  scale            TEXT    NOT NULL DEFAULT '中型'
                     CHECK (scale IN ('大型', '中型', '小型')),
  stage            TEXT    NOT NULL DEFAULT 'lead'
                     CHECK (stage IN ('lead', 'following', 'negotiation', 'signed')),
  estimated_amount REAL    NOT NULL DEFAULT 0
                     CHECK (estimated_amount >= 0),          -- 预估金额（元）
  health_score     INTEGER NOT NULL DEFAULT 60
                     CHECK (health_score BETWEEN 0 AND 100), -- 健康度评分
  owner            TEXT    NOT NULL DEFAULT '未分配',        -- 客户经理
  region           TEXT,                                    -- 大区/城市
  note             TEXT,                                    -- 备注
  signed_at        TEXT,                                    -- 实际签约日期，用于"本月已签"
  created_at       TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_accounts_stage  ON accounts (stage);
CREATE INDEX IF NOT EXISTS idx_accounts_health ON accounts (health_score);
CREATE INDEX IF NOT EXISTS idx_accounts_owner  ON accounts (owner);

-- ------------------------------------------------------------
-- 2. 决策链角色 Stakeholders
--    role_type  决策者 decision_maker / 使用者 user
--               / 影响者 influencer / 支持者 supporter
--    attitude   支持 support / 中立 neutral / 反对 oppose
--    focus      关注点（ROI / 预算 / 体验…）
--    core_demand 核心诉求、strategy 应对策略 —— 图谱 Tooltip 的数据源
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stakeholders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  INTEGER NOT NULL,
  name        TEXT    NOT NULL,
  title       TEXT    NOT NULL DEFAULT '',                   -- 职务
  role_type   TEXT    NOT NULL DEFAULT 'influencer'
                CHECK (role_type IN ('decision_maker', 'user', 'influencer', 'supporter')),
  focus       TEXT,                                          -- 关注点，如 "ROI / 预算"
  attitude    TEXT    NOT NULL DEFAULT 'neutral'
                CHECK (attitude IN ('support', 'neutral', 'oppose')),
  influence   INTEGER NOT NULL DEFAULT 3
                CHECK (influence BETWEEN 1 AND 5),           -- 影响力 1-5，决定卡片排序
  core_demand TEXT,                                          -- 核心诉求（悬浮展示）
  strategy    TEXT,                                          -- 应对策略（悬浮展示）
  created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stakeholders_account ON stakeholders (account_id);
CREATE INDEX IF NOT EXISTS idx_stakeholders_role    ON stakeholders (account_id, role_type);

-- ------------------------------------------------------------
-- 3. 跟进记录 Interactions
--    channel    拜访 visit / 电话 call
--    pain_point 本次识别出的新痛点或卡点（可人工填写，也可由
--               Ollama 抽取后回写，见第 4 步 /api/ai/extract）
--    stakeholder_id 可为空；联系人被删后置 NULL，纪要保留
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interactions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id     INTEGER NOT NULL,
  stakeholder_id INTEGER,
  channel        TEXT    NOT NULL DEFAULT 'visit'
                   CHECK (channel IN ('visit', 'call')),
  contact_date   TEXT    NOT NULL DEFAULT (date('now', 'localtime')),
  summary        TEXT    NOT NULL,                            -- 沟通纪要
  pain_point     TEXT,                                        -- 新痛点 / 卡点
  source         TEXT    NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('manual', 'ai')),
  created_at     TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (account_id)     REFERENCES accounts (id)     ON DELETE CASCADE,
  FOREIGN KEY (stakeholder_id) REFERENCES stakeholders (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_interactions_account ON interactions (account_id);
CREATE INDEX IF NOT EXISTS idx_interactions_date    ON interactions (contact_date DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_stake   ON interactions (stakeholder_id);

-- ------------------------------------------------------------
-- 4. 待办事项 Tasks
--    is_done = 0 且 due_date < 今天 → 逾期任务（看板第 3 张卡）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  content    TEXT    NOT NULL,
  due_date   TEXT    NOT NULL,                                -- YYYY-MM-DD
  is_done    INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0, 1)),
  done_at    TEXT,
  priority   TEXT    NOT NULL DEFAULT 'medium'
               CHECK (priority IN ('high', 'medium', 'low')),
  created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_account ON tasks (account_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due     ON tasks (is_done, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_date    ON tasks (due_date);

-- ------------------------------------------------------------
-- 5. 月度目标 Sales Targets —— "本月目标金额" 卡片的唯一数据源
--    month 用 'YYYY-MM'，天然可做 UNIQUE，避免同月重复配置
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_targets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  month         TEXT NOT NULL UNIQUE,
  target_amount REAL NOT NULL DEFAULT 0 CHECK (target_amount >= 0),
  created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ------------------------------------------------------------
-- 6. AI 分析留痕 Ai Analyses
--    第 4 步每次调 Ollama 的输入/输出/耗时都留档，方便复盘
--    模型判断（degraded=1 表示走了本地规则降级）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_analyses (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id     INTEGER,
  interaction_id INTEGER,
  raw_text       TEXT NOT NULL,
  model          TEXT,
  degraded       INTEGER NOT NULL DEFAULT 0 CHECK (degraded IN (0, 1)),
  result_json    TEXT NOT NULL,                               -- 结构化验出结果
  latency_ms     INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (account_id)     REFERENCES accounts (id)     ON DELETE CASCADE,
  FOREIGN KEY (interaction_id) REFERENCES interactions (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_account ON ai_analyses (account_id);
CREATE INDEX IF NOT EXISTS idx_ai_created ON ai_analyses (created_at DESC);

-- ------------------------------------------------------------
-- 7. 触发器：updated_at 自动维护
--    SQLite 触发器默认不递归，不会自激
-- ------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_accounts_touch
AFTER UPDATE OF name, industry, scale, stage, estimated_amount, health_score, owner, note, signed_at
ON accounts
BEGIN
  UPDATE accounts SET updated_at = datetime('now', 'localtime') WHERE id = NEW.id;
END;

-- ------------------------------------------------------------
-- 8. 视图：客户全景（看板/列表直接用，避免 N+1 与重复口径）
-- ------------------------------------------------------------
CREATE VIEW IF NOT EXISTS v_account_overview AS
SELECT
  a.id,
  a.name,
  a.industry,
  a.scale,
  a.stage,
  a.estimated_amount,
  a.health_score,
  a.owner,
  a.region,
  a.note,
  a.signed_at,
  a.created_at,
  a.updated_at,
  (SELECT COUNT(*) FROM stakeholders s WHERE s.account_id = a.id) AS stakeholder_count,
  (SELECT COUNT(*) FROM stakeholders s
    WHERE s.account_id = a.id AND s.attitude = 'oppose')           AS opposer_count,
  (SELECT COUNT(*) FROM tasks t
    WHERE t.account_id = a.id AND t.is_done = 0
      AND t.due_date < date('now', 'localtime'))                   AS overdue_task_count,
  (SELECT MAX(i.contact_date) FROM interactions i
    WHERE i.account_id = a.id)                                     AS last_contact_date
FROM accounts a;

-- ------------------------------------------------------------
-- 9. 账号与会话（本地登录）
--    password_hash 存 scrypt 派生值（格式 scrypt$N$r$p$salt$hash），
--    绝不存明文；sessions 只存 token 的 SHA-256，泄库也拿不到可用凭据。
--    sessions.user_id 走 CASCADE：删用户即吊销其全部登录态。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  display_name  TEXT    NOT NULL DEFAULT '',
  role          TEXT    NOT NULL DEFAULT 'sales'
                  CHECK (role IN ('admin', 'sales')),
  title         TEXT,                                     -- 职务，展示在个人信息里
  email         TEXT,
  phone         TEXT,
  password_hash TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT    NOT NULL UNIQUE,
  user_id    INTEGER NOT NULL,
  user_agent TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  expires_at TEXT    NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
