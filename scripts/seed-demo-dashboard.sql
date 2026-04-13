-- ============================================================================
-- Seed 14 virtual demo members with MULTI-PERIOD historical data
-- for Dashboard demonstration (sparklines, badges, promotion history)
--
-- Run on server: sqlite3 /opt/ai-seed-project/data/app.db < seed-demo-dashboard.sql
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- Step 0: Create 3 historical (ended) periods so periodCount >= 4
-- This enables badge computation (requires periodCount >= 2) and
-- multi-point sparklines in the member detail page.
-- ────────────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO v2_periods (id, camp_id, name, started_at, ended_at, status)
SELECT 'seed-period-1', id, '第1周', '2026-03-23T00:00:00Z', '2026-03-30T00:00:00Z', 'ended'
FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR IGNORE INTO v2_periods (id, camp_id, name, started_at, ended_at, status)
SELECT 'seed-period-2', id, '第2周', '2026-03-30T00:00:00Z', '2026-04-06T00:00:00Z', 'ended'
FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR IGNORE INTO v2_periods (id, camp_id, name, started_at, ended_at, status)
SELECT 'seed-period-3', id, '第3周', '2026-04-06T00:00:00Z', '2026-04-13T00:00:00Z', 'ended'
FROM camps WHERE status = 'active' LIMIT 1;


-- ────────────────────────────────────────────────────────────────────────────
-- Step 0b: Create 3 evaluation windows (1:1 with ended periods)
-- ────────────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO v2_windows (id, camp_id, period_id, name, opened_at, closed_at, settled_at, status)
SELECT 'seed-window-1', id, 'seed-period-1', '评估窗口1',
  '2026-03-23T00:00:00Z', '2026-03-30T00:00:00Z', '2026-03-30T01:00:00Z', 'settled'
FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR IGNORE INTO v2_windows (id, camp_id, period_id, name, opened_at, closed_at, settled_at, status)
SELECT 'seed-window-2', id, 'seed-period-2', '评估窗口2',
  '2026-03-30T00:00:00Z', '2026-04-06T00:00:00Z', '2026-04-06T01:00:00Z', 'settled'
FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR IGNORE INTO v2_windows (id, camp_id, period_id, name, opened_at, closed_at, settled_at, status)
SELECT 'seed-window-3', id, 'seed-period-3', '评估窗口3',
  '2026-04-06T00:00:00Z', '2026-04-13T00:00:00Z', '2026-04-13T01:00:00Z', 'settled'
FROM camps WHERE status = 'active' LIMIT 1;


-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: Insert 14 demo members
-- Distribution across 5 levels: L5(1), L4(2), L3(3), L2(4), L1(4)
-- ────────────────────────────────────────────────────────────────────────────

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-01', id, '许DC', '许DC', '', 'default', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-02', id, '张明', '张明', '', 'default', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-03', id, '李雪', '李雪', '', 'default', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-04', id, '王磊', '王磊', '', 'Marketing', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-05', id, '陈思', '陈思', '', 'default', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-06', id, '刘洋', '刘洋', '', 'Sales', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-07', id, '赵琪', '赵琪', '', 'default', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-08', id, '周杰', '周杰', '', 'Marketing', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-09', id, '吴昊', '吴昊', '', 'default', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-10', id, '林悦', '林悦', '', 'Sales', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-11', id, '黄丽', '黄丽', '', 'default', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-12', id, '孙伟', '孙伟', '', 'Marketing', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-13', id, '郑芳', '郑芳', '', 'default', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-14', id, '马骏', '马骏', '', 'Sales', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;


-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: Insert member levels
-- L5=许DC, L4=张明/李雪, L3=王磊/陈思/刘洋, L2=赵琪/周杰/吴昊/林悦,
-- L1=黄丽/孙伟/郑芳/马骏
-- ────────────────────────────────────────────────────────────────────────────

INSERT OR REPLACE INTO v2_member_levels (member_id, current_level, level_attained_at, last_window_id, updated_at)
VALUES
  ('demo-01', 5, '2026-04-13T01:00:00Z', 'seed-window-3', '2026-04-13T01:00:00Z'),
  ('demo-02', 4, '2026-04-13T01:00:00Z', 'seed-window-3', '2026-04-13T01:00:00Z'),
  ('demo-03', 4, '2026-04-13T01:00:00Z', 'seed-window-3', '2026-04-13T01:00:00Z'),
  ('demo-04', 3, '2026-04-13T01:00:00Z', 'seed-window-3', '2026-04-13T01:00:00Z'),
  ('demo-05', 3, '2026-04-06T01:00:00Z', 'seed-window-2', '2026-04-06T01:00:00Z'),
  ('demo-06', 3, '2026-04-13T01:00:00Z', 'seed-window-3', '2026-04-13T01:00:00Z'),
  ('demo-07', 2, '2026-04-06T01:00:00Z', 'seed-window-2', '2026-04-06T01:00:00Z'),
  ('demo-08', 2, '2026-04-06T01:00:00Z', 'seed-window-2', '2026-04-06T01:00:00Z'),
  ('demo-09', 2, '2026-04-13T01:00:00Z', 'seed-window-3', '2026-04-13T01:00:00Z'),
  ('demo-10', 2, '2026-04-13T01:00:00Z', 'seed-window-3', '2026-04-13T01:00:00Z'),
  ('demo-11', 1, '2026-04-13T00:00:00Z', NULL, '2026-04-13T00:00:00Z'),
  ('demo-12', 1, '2026-04-13T00:00:00Z', NULL, '2026-04-13T00:00:00Z'),
  ('demo-13', 1, '2026-04-13T00:00:00Z', NULL, '2026-04-13T00:00:00Z'),
  ('demo-14', 1, '2026-04-13T00:00:00Z', NULL, '2026-04-13T00:00:00Z');


-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: Window Snapshots — 3 historical windows × 14 members
-- Each window shows progressive score growth for realistic sparklines.
-- cumulative_aq = running total up to and including that window.
-- ────────────────────────────────────────────────────────────────────────────

-- ==================== Window 1 (第1周) ====================
-- 许DC (demo-01): K=15 H=12 C=18 S=10 G=12 → windowAQ=67 cumAQ=67
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w1-demo-01', 'seed-window-1', 'demo-01', 67, 67, 15, 12, 18, 10, 12, '2026-03-30T01:00:00Z');

-- 张明 (demo-02): K=12 H=10 C=8 S=8 G=10 → windowAQ=48 cumAQ=48
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w1-demo-02', 'seed-window-1', 'demo-02', 48, 48, 12, 10, 8, 8, 10, '2026-03-30T01:00:00Z');

-- 李雪 (demo-03): K=10 H=8 C=10 S=10 G=15 → windowAQ=53 cumAQ=53
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w1-demo-03', 'seed-window-1', 'demo-03', 53, 53, 10, 8, 10, 10, 15, '2026-03-30T01:00:00Z');

-- 王磊 (demo-04): K=8 H=7 C=6 S=5 G=5 → windowAQ=31 cumAQ=31
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w1-demo-04', 'seed-window-1', 'demo-04', 31, 31, 8, 7, 6, 5, 5, '2026-03-30T01:00:00Z');

-- 陈思 (demo-05): K=8 H=5 C=6 S=10 G=8 → windowAQ=37 cumAQ=37
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w1-demo-05', 'seed-window-1', 'demo-05', 37, 37, 8, 5, 6, 10, 8, '2026-03-30T01:00:00Z');

-- 刘洋 (demo-06): K=5 H=10 C=4 S=3 G=5 → windowAQ=27 cumAQ=27
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w1-demo-06', 'seed-window-1', 'demo-06', 27, 27, 5, 10, 4, 3, 5, '2026-03-30T01:00:00Z');

-- 赵琪 (demo-07): K=4 H=3 C=3 S=3 G=5 → windowAQ=18 cumAQ=18
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w1-demo-07', 'seed-window-1', 'demo-07', 18, 18, 4, 3, 3, 3, 5, '2026-03-30T01:00:00Z');

-- 周杰 (demo-08): K=3 H=5 C=2 S=2 G=3 → windowAQ=15 cumAQ=15
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w1-demo-08', 'seed-window-1', 'demo-08', 15, 15, 3, 5, 2, 2, 3, '2026-03-30T01:00:00Z');

-- 吴昊 (demo-09): K=3 H=2 C=4 S=3 G=3 → windowAQ=15 cumAQ=15
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w1-demo-09', 'seed-window-1', 'demo-09', 15, 15, 3, 2, 4, 3, 3, '2026-03-30T01:00:00Z');

-- 林悦 (demo-10): K=2 H=3 C=3 S=2 G=3 → windowAQ=13 cumAQ=13
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w1-demo-10', 'seed-window-1', 'demo-10', 13, 13, 2, 3, 3, 2, 3, '2026-03-30T01:00:00Z');

-- 黄丽 (demo-11): K=1 H=2 C=1 S=1 G=1 → windowAQ=6 cumAQ=6
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w1-demo-11', 'seed-window-1', 'demo-11', 6, 6, 1, 2, 1, 1, 1, '2026-03-30T01:00:00Z');

-- 孙伟 (demo-12): K=1 H=1 C=1 S=1 G=1 → windowAQ=5 cumAQ=5
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w1-demo-12', 'seed-window-1', 'demo-12', 5, 5, 1, 1, 1, 1, 1, '2026-03-30T01:00:00Z');

-- 郑芳 (demo-13): K=1 H=1 C=0 S=1 G=0 → windowAQ=3 cumAQ=3
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w1-demo-13', 'seed-window-1', 'demo-13', 3, 3, 1, 1, 0, 1, 0, '2026-03-30T01:00:00Z');

-- 马骏 (demo-14): K=0 H=0 C=1 S=0 G=1 → windowAQ=2 cumAQ=2
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w1-demo-14', 'seed-window-1', 'demo-14', 2, 2, 0, 0, 1, 0, 1, '2026-03-30T01:00:00Z');


-- ==================== Window 2 (第2周) ====================
-- 许DC: K=28 H=25 C=32 S=22 G=25 → windowAQ=132 cumAQ=199
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w2-demo-01', 'seed-window-2', 'demo-01', 132, 199, 28, 25, 32, 22, 25, '2026-04-06T01:00:00Z');

-- 张明: K=22 H=18 C=16 S=14 G=20 → windowAQ=90 cumAQ=138
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w2-demo-02', 'seed-window-2', 'demo-02', 90, 138, 22, 18, 16, 14, 20, '2026-04-06T01:00:00Z');

-- 李雪: K=20 H=16 C=22 S=18 G=28 → windowAQ=104 cumAQ=157
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w2-demo-03', 'seed-window-2', 'demo-03', 104, 157, 20, 16, 22, 18, 28, '2026-04-06T01:00:00Z');

-- 王磊: K=15 H=14 C=12 S=10 G=10 → windowAQ=61 cumAQ=92
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w2-demo-04', 'seed-window-2', 'demo-04', 61, 92, 15, 14, 12, 10, 10, '2026-04-06T01:00:00Z');

-- 陈思: K=16 H=12 C=15 S=18 G=16 → windowAQ=77 cumAQ=114
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w2-demo-05', 'seed-window-2', 'demo-05', 77, 114, 16, 12, 15, 18, 16, '2026-04-06T01:00:00Z');

-- 刘洋: K=12 H=18 C=10 S=8 G=12 → windowAQ=60 cumAQ=87
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w2-demo-06', 'seed-window-2', 'demo-06', 60, 87, 12, 18, 10, 8, 12, '2026-04-06T01:00:00Z');

-- 赵琪: K=10 H=8 C=7 S=7 G=12 → windowAQ=44 cumAQ=62
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w2-demo-07', 'seed-window-2', 'demo-07', 44, 62, 10, 8, 7, 7, 12, '2026-04-06T01:00:00Z');

-- 周杰: K=8 H=12 C=5 S=5 G=8 → windowAQ=38 cumAQ=53
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w2-demo-08', 'seed-window-2', 'demo-08', 38, 53, 8, 12, 5, 5, 8, '2026-04-06T01:00:00Z');

-- 吴昊: K=7 H=5 C=8 S=6 G=7 → windowAQ=33 cumAQ=48
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w2-demo-09', 'seed-window-2', 'demo-09', 33, 48, 7, 5, 8, 6, 7, '2026-04-06T01:00:00Z');

-- 林悦: K=5 H=7 C=7 S=5 G=8 → windowAQ=32 cumAQ=45
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w2-demo-10', 'seed-window-2', 'demo-10', 32, 45, 5, 7, 7, 5, 8, '2026-04-06T01:00:00Z');

-- 黄丽: K=3 H=5 C=3 S=3 G=3 → windowAQ=17 cumAQ=23
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w2-demo-11', 'seed-window-2', 'demo-11', 17, 23, 3, 5, 3, 3, 3, '2026-04-06T01:00:00Z');

-- 孙伟: K=2 H=3 C=2 S=3 G=2 → windowAQ=12 cumAQ=17
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w2-demo-12', 'seed-window-2', 'demo-12', 12, 17, 2, 3, 2, 3, 2, '2026-04-06T01:00:00Z');

-- 郑芳: K=3 H=2 C=1 S=2 G=1 → windowAQ=9 cumAQ=12
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w2-demo-13', 'seed-window-2', 'demo-13', 9, 12, 3, 2, 1, 2, 1, '2026-04-06T01:00:00Z');

-- 马骏: K=1 H=1 C=2 S=1 G=2 → windowAQ=7 cumAQ=9
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w2-demo-14', 'seed-window-2', 'demo-14', 7, 9, 1, 1, 2, 1, 2, '2026-04-06T01:00:00Z');


-- ==================== Window 3 (第3周) ====================
-- 许DC: K=38 H=33 C=36 S=30 G=33 → windowAQ=170 cumAQ=369
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w3-demo-01', 'seed-window-3', 'demo-01', 170, 369, 38, 33, 36, 30, 33, '2026-04-13T01:00:00Z');

-- 张明: K=28 H=25 C=22 S=20 G=26 → windowAQ=121 cumAQ=259
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w3-demo-02', 'seed-window-3', 'demo-02', 121, 259, 28, 25, 22, 20, 26, '2026-04-13T01:00:00Z');

-- 李雪: K=28 H=22 C=28 S=24 G=32 → windowAQ=134 cumAQ=291
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w3-demo-03', 'seed-window-3', 'demo-03', 134, 291, 28, 22, 28, 24, 32, '2026-04-13T01:00:00Z');

-- 王磊: K=20 H=18 C=16 S=13 G=13 → windowAQ=80 cumAQ=172
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w3-demo-04', 'seed-window-3', 'demo-04', 80, 172, 20, 18, 16, 13, 13, '2026-04-13T01:00:00Z');

-- 陈思: K=22 H=16 C=20 S=22 G=22 → windowAQ=102 cumAQ=216
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w3-demo-05', 'seed-window-3', 'demo-05', 102, 216, 22, 16, 20, 22, 22, '2026-04-13T01:00:00Z');

-- 刘洋: K=16 H=20 C=14 S=11 G=16 → windowAQ=77 cumAQ=164
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w3-demo-06', 'seed-window-3', 'demo-06', 77, 164, 16, 20, 14, 11, 16, '2026-04-13T01:00:00Z');

-- 赵琪: K=13 H=11 C=9 S=9 G=16 → windowAQ=58 cumAQ=120
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w3-demo-07', 'seed-window-3', 'demo-07', 58, 120, 13, 11, 9, 9, 16, '2026-04-13T01:00:00Z');

-- 周杰: K=11 H=14 C=7 S=7 G=11 → windowAQ=50 cumAQ=103
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w3-demo-08', 'seed-window-3', 'demo-08', 50, 103, 11, 14, 7, 7, 11, '2026-04-13T01:00:00Z');

-- 吴昊: K=9 H=7 C=11 S=9 G=9 → windowAQ=45 cumAQ=93
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w3-demo-09', 'seed-window-3', 'demo-09', 45, 93, 9, 7, 11, 9, 9, '2026-04-13T01:00:00Z');

-- 林悦: K=7 H=9 C=9 S=7 G=10 → windowAQ=42 cumAQ=87
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w3-demo-10', 'seed-window-3', 'demo-10', 42, 87, 7, 9, 9, 7, 10, '2026-04-13T01:00:00Z');

-- 黄丽: K=4 H=7 C=4 S=4 G=4 → windowAQ=23 cumAQ=46
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w3-demo-11', 'seed-window-3', 'demo-11', 23, 46, 4, 7, 4, 4, 4, '2026-04-13T01:00:00Z');

-- 孙伟: K=3 H=4 C=2 S=4 G=3 → windowAQ=16 cumAQ=33
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w3-demo-12', 'seed-window-3', 'demo-12', 16, 33, 3, 4, 2, 4, 3, '2026-04-13T01:00:00Z');

-- 郑芳: K=4 H=2 C=2 S=2 G=2 → windowAQ=12 cumAQ=24
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w3-demo-13', 'seed-window-3', 'demo-13', 12, 24, 4, 2, 2, 2, 2, '2026-04-13T01:00:00Z');

-- 马骏: K=2 H=2 C=2 S=2 G=2 → windowAQ=10 cumAQ=19
INSERT OR REPLACE INTO v2_window_snapshots (id, window_id, member_id, window_aq, cumulative_aq, k_score, h_score, c_score, s_score, g_score, snapshot_at)
VALUES ('seed-snap-w3-demo-14', 'seed-window-3', 'demo-14', 10, 19, 2, 2, 2, 2, 2, '2026-04-13T01:00:00Z');


-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: Current period (P4) live dimension scores
-- These represent the active (un-ended) period — used by ranking query fallback
-- and appended to sparklines as the latest "live" data point.
-- ────────────────────────────────────────────────────────────────────────────

-- 许DC (demo-01): K40 H35 C38 S32 G35 → liveAQ=180
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-01', id, 'K', 40, 12 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-01', id, 'H', 35, 10 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-01', id, 'C', 38, 8 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-01', id, 'S', 32, 9 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-01', id, 'G', 35, 11 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;

-- 张明 (demo-02): K30 H28 C25 S22 G30 → liveAQ=135
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-02', id, 'K', 30, 9 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-02', id, 'H', 28, 8 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-02', id, 'C', 25, 7 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-02', id, 'S', 22, 6 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-02', id, 'G', 30, 9 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;

-- 李雪 (demo-03): K32 H25 C30 S28 G35 → liveAQ=150
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-03', id, 'K', 32, 10 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-03', id, 'H', 25, 7 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-03', id, 'C', 30, 8 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-03', id, 'S', 28, 8 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-03', id, 'G', 35, 10 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;

-- 王磊 (demo-04): K22 H20 C18 S15 G15 → liveAQ=90
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-04', id, 'K', 22, 6 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-04', id, 'H', 20, 6 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-04', id, 'C', 18, 5 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-04', id, 'S', 15, 4 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-04', id, 'G', 15, 4 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;

-- 陈思 (demo-05): K25 H18 C22 S20 G25 → liveAQ=110
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-05', id, 'K', 25, 7 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-05', id, 'H', 18, 5 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-05', id, 'C', 22, 6 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-05', id, 'S', 20, 6 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-05', id, 'G', 25, 7 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;

-- 刘洋 (demo-06): K18 H22 C15 S12 G18 → liveAQ=85
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-06', id, 'K', 18, 5 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-06', id, 'H', 22, 6 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-06', id, 'C', 15, 4 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-06', id, 'S', 12, 3 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-06', id, 'G', 18, 5 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;

-- 赵琪 (demo-07): K15 H12 C10 S10 G18 → liveAQ=65
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-07', id, 'K', 15, 4 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-07', id, 'H', 12, 3 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-07', id, 'C', 10, 3 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-07', id, 'S', 10, 3 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-07', id, 'G', 18, 5 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;

-- 周杰 (demo-08): K12 H15 C8 S8 G12 → liveAQ=55
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-08', id, 'K', 12, 3 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-08', id, 'H', 15, 4 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-08', id, 'C', 8, 2 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-08', id, 'S', 8, 2 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-08', id, 'G', 12, 3 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;

-- 吴昊 (demo-09): K10 H8 C12 S10 G10 → liveAQ=50
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-09', id, 'K', 10, 3 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-09', id, 'H', 8, 2 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-09', id, 'C', 12, 3 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-09', id, 'S', 10, 3 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-09', id, 'G', 10, 3 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;

-- 林悦 (demo-10): K8 H10 C10 S8 G12 → liveAQ=48
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-10', id, 'K', 8, 2 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-10', id, 'H', 10, 3 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-10', id, 'C', 10, 3 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-10', id, 'S', 8, 2 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-10', id, 'G', 12, 3 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;

-- 黄丽 (demo-11): K5 H8 C5 S5 G5 → liveAQ=28
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-11', id, 'K', 5, 1 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-11', id, 'H', 8, 2 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-11', id, 'C', 5, 1 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-11', id, 'S', 5, 1 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-11', id, 'G', 5, 1 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;

-- 孙伟 (demo-12): K3 H5 C3 S5 G4 → liveAQ=20
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-12', id, 'K', 3, 1 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-12', id, 'H', 5, 1 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-12', id, 'C', 3, 1 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-12', id, 'S', 5, 1 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-12', id, 'G', 4, 1 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;

-- 郑芳 (demo-13): K5 H3 C2 S3 G2 → liveAQ=15
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-13', id, 'K', 5, 1 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-13', id, 'H', 3, 1 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-13', id, 'C', 2, 1 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-13', id, 'S', 3, 1 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-13', id, 'G', 2, 1 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;

-- 马骏 (demo-14): K2 H2 C3 S2 G3 → liveAQ=12
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-14', id, 'K', 2, 1 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-14', id, 'H', 2, 1 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-14', id, 'C', 3, 1 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-14', id, 'S', 2, 1 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;
INSERT OR REPLACE INTO v2_member_dimension_scores (member_id, period_id, dimension, period_score, event_count)
SELECT 'demo-14', id, 'G', 3, 1 FROM v2_periods WHERE ended_at IS NULL LIMIT 1;


-- ────────────────────────────────────────────────────────────────────────────
-- Step 5: Promotion Records (段位变动记录)
-- Auto-generated by domain logic in production; seeded here for demo.
-- ────────────────────────────────────────────────────────────────────────────

INSERT OR REPLACE INTO v2_promotion_records (id, window_id, member_id, evaluated_at, from_level, to_level, promoted, path_taken, reason)
VALUES
  -- 许DC: L1→L2 (W1), L2→L3 (W2), L3→L5 (W3) — exceptional growth
  ('seed-promo-w1-demo-01', 'seed-window-1', 'demo-01', '2026-03-30T01:00:00Z', 1, 2, 1, 'standard', '第1周评估: AQ达标晋升'),
  ('seed-promo-w2-demo-01', 'seed-window-2', 'demo-01', '2026-04-06T01:00:00Z', 2, 3, 1, 'standard', '第2周评估: 五维均衡发展，大幅超标'),
  ('seed-promo-w3-demo-01', 'seed-window-3', 'demo-01', '2026-04-13T01:00:00Z', 3, 5, 1, 'fast_track', '第3周评估: 全维度卓越，跳级晋升'),

  -- 张明: L1→L2 (W2), L2→L4 (W3) — strong late growth
  ('seed-promo-w2-demo-02', 'seed-window-2', 'demo-02', '2026-04-06T01:00:00Z', 1, 2, 1, 'standard', '第2周评估: 持续进步达标'),
  ('seed-promo-w3-demo-02', 'seed-window-3', 'demo-02', '2026-04-13T01:00:00Z', 2, 4, 1, 'fast_track', '第3周评估: 知识力突出，跳级晋升'),

  -- 李雪: L1→L2 (W1), L2→L3 (W2), L3→L4 (W3)
  ('seed-promo-w1-demo-03', 'seed-window-1', 'demo-03', '2026-03-30T01:00:00Z', 1, 2, 1, 'standard', '第1周评估: 成长力突出'),
  ('seed-promo-w2-demo-03', 'seed-window-2', 'demo-03', '2026-04-06T01:00:00Z', 2, 3, 1, 'standard', '第2周评估: 稳步提升'),
  ('seed-promo-w3-demo-03', 'seed-window-3', 'demo-03', '2026-04-13T01:00:00Z', 3, 4, 1, 'standard', '第3周评估: 成长维度持续领先'),

  -- 王磊: L1→L2 (W2), L2→L3 (W3)
  ('seed-promo-w2-demo-04', 'seed-window-2', 'demo-04', '2026-04-06T01:00:00Z', 1, 2, 1, 'standard', '第2周评估: 均衡发展达标'),
  ('seed-promo-w3-demo-04', 'seed-window-3', 'demo-04', '2026-04-13T01:00:00Z', 2, 3, 1, 'standard', '第3周评估: 知识与实操双提升'),

  -- 陈思: L1→L2 (W2), L2→L3 (W2→W3 period)
  ('seed-promo-w2-demo-05', 'seed-window-2', 'demo-05', '2026-04-06T01:00:00Z', 1, 2, 1, 'standard', '第2周评估: 社交力突出，达标晋升'),
  ('seed-promo-w3-demo-05', 'seed-window-3', 'demo-05', '2026-04-13T01:00:00Z', 2, 3, 1, 'standard', '第3周评估: 全面发展'),

  -- 刘洋: L1→L2 (W2), L2→L3 (W3)
  ('seed-promo-w2-demo-06', 'seed-window-2', 'demo-06', '2026-04-06T01:00:00Z', 1, 2, 1, 'standard', '第2周评估: 实操能力出色'),
  ('seed-promo-w3-demo-06', 'seed-window-3', 'demo-06', '2026-04-13T01:00:00Z', 2, 3, 1, 'standard', '第3周评估: 持续实践提升'),

  -- 赵琪: L1→L2 (W2)
  ('seed-promo-w2-demo-07', 'seed-window-2', 'demo-07', '2026-04-06T01:00:00Z', 1, 2, 1, 'standard', '第2周评估: 稳步积累达标'),

  -- 周杰: L1→L2 (W2)
  ('seed-promo-w2-demo-08', 'seed-window-2', 'demo-08', '2026-04-06T01:00:00Z', 1, 2, 1, 'standard', '第2周评估: 实操带动整体进步'),

  -- 吴昊: L1→L2 (W3)
  ('seed-promo-w3-demo-09', 'seed-window-3', 'demo-09', '2026-04-13T01:00:00Z', 1, 2, 1, 'standard', '第3周评估: 创造力提升达标'),

  -- 林悦: L1→L2 (W3)
  ('seed-promo-w3-demo-10', 'seed-window-3', 'demo-10', '2026-04-13T01:00:00Z', 1, 2, 1, 'standard', '第3周评估: 成长维度稳步提升');


-- ────────────────────────────────────────────────────────────────────────────
-- Step 6: Verification queries
-- ────────────────────────────────────────────────────────────────────────────

SELECT '=== Period Count ===' AS info;
SELECT COUNT(*) AS total_periods FROM v2_periods;

SELECT '=== Window Snapshots per Window ===' AS info;
SELECT window_id, COUNT(*) AS member_count FROM v2_window_snapshots WHERE window_id LIKE 'seed-%' GROUP BY window_id;

SELECT '=== Promotion Records ===' AS info;
SELECT pr.member_id, m.display_name, pr.window_id, pr.from_level, pr.to_level, pr.reason
FROM v2_promotion_records pr
JOIN members m ON m.id = pr.member_id
WHERE pr.id LIKE 'seed-%'
ORDER BY pr.evaluated_at, pr.member_id;

SELECT '=== Demo Members with Cumulative AQ ===' AS info;
SELECT m.id, m.display_name, ml.current_level,
  ws.cumulative_aq AS snapshot_cumaq,
  (SELECT SUM(period_score) FROM v2_member_dimension_scores ds
   WHERE ds.member_id = m.id
     AND ds.period_id IN (SELECT id FROM v2_periods WHERE ended_at IS NULL)) AS live_aq
FROM members m
LEFT JOIN v2_member_levels ml ON ml.member_id = m.id
LEFT JOIN (
  SELECT member_id, cumulative_aq,
    ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY snapshot_at DESC) AS rn
  FROM v2_window_snapshots
) ws ON ws.member_id = m.id AND ws.rn = 1
WHERE m.id LIKE 'demo-%'
ORDER BY ws.cumulative_aq DESC;
