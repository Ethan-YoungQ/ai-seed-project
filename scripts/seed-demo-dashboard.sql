-- ============================================================================
-- Seed 14 virtual demo members for Dashboard demonstration
-- Run on server: sqlite3 /opt/ai-seed-project/data/app.db < seed-demo-dashboard.sql
-- ============================================================================

-- Use the first active camp's ID (dynamically)
-- Also grab the active (un-ended) period for live score insertion

-- Step 1: Insert 14 demo members
-- Distribution across 5 levels: L5(1), L4(2), L3(3), L2(4), L1(4)

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-01', id, '许DC', '许DC', '', 'HBU', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-02', id, '张明', '张明', '', 'HBU', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-03', id, '李雪', '李雪', '', 'HBU', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-04', id, '王磊', '王磊', '', 'Marketing', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-05', id, '陈思', '陈思', '', 'HBU', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-06', id, '刘洋', '刘洋', '', 'Sales', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-07', id, '赵琪', '赵琪', '', 'HBU', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-08', id, '周杰', '周杰', '', 'Marketing', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-09', id, '吴昊', '吴昊', '', 'HBU', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-10', id, '林悦', '林悦', '', 'Sales', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-11', id, '黄丽', '黄丽', '', 'HBU', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-12', id, '孙伟', '孙伟', '', 'Marketing', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-13', id, '郑芳', '郑芳', '', 'HBU', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;

INSERT OR REPLACE INTO members (id, camp_id, name, display_name, avatar_url, department, role_type, is_participant, is_excluded_from_board, status)
SELECT 'demo-14', id, '马骏', '马骏', '', 'Sales', 'student', 1, 0, 'active' FROM camps WHERE status = 'active' LIMIT 1;


-- Step 2: Insert member levels
-- L5=许DC, L4=张明/李雪, L3=王磊/陈思/刘洋, L2=赵琪/周杰/吴昊/林悦, L1=黄丽/孙伟/郑芳/马骏

INSERT OR REPLACE INTO v2_member_levels (member_id, current_level, level_attained_at, last_window_id, updated_at)
VALUES
  ('demo-01', 5, '2026-04-13T00:00:00Z', NULL, '2026-04-13T00:00:00Z'),
  ('demo-02', 4, '2026-04-13T00:00:00Z', NULL, '2026-04-13T00:00:00Z'),
  ('demo-03', 4, '2026-04-13T00:00:00Z', NULL, '2026-04-13T00:00:00Z'),
  ('demo-04', 3, '2026-04-13T00:00:00Z', NULL, '2026-04-13T00:00:00Z'),
  ('demo-05', 3, '2026-04-13T00:00:00Z', NULL, '2026-04-13T00:00:00Z'),
  ('demo-06', 3, '2026-04-13T00:00:00Z', NULL, '2026-04-13T00:00:00Z'),
  ('demo-07', 2, '2026-04-13T00:00:00Z', NULL, '2026-04-13T00:00:00Z'),
  ('demo-08', 2, '2026-04-13T00:00:00Z', NULL, '2026-04-13T00:00:00Z'),
  ('demo-09', 2, '2026-04-13T00:00:00Z', NULL, '2026-04-13T00:00:00Z'),
  ('demo-10', 2, '2026-04-13T00:00:00Z', NULL, '2026-04-13T00:00:00Z'),
  ('demo-11', 1, '2026-04-13T00:00:00Z', NULL, '2026-04-13T00:00:00Z'),
  ('demo-12', 1, '2026-04-13T00:00:00Z', NULL, '2026-04-13T00:00:00Z'),
  ('demo-13', 1, '2026-04-13T00:00:00Z', NULL, '2026-04-13T00:00:00Z'),
  ('demo-14', 1, '2026-04-13T00:00:00Z', NULL, '2026-04-13T00:00:00Z');


-- Step 3: Insert dimension scores for the active (un-ended) period
-- The ranking query fetches live scores from v2_member_dimension_scores WHERE period ended_at IS NULL
-- Scores: K=Knowledge, H=Hands-on, C=Creativity, S=Social, G=Growth

-- 许DC (demo-01): L5 ⚡ AQ=180 — K40 H35 C38 S32 G35
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

-- 张明 (demo-02): L4 🧠 AQ=135 — K30 H28 C25 S22 G30
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

-- 李雪 (demo-03): L4 🧠 AQ=150 — K32 H25 C30 S28 G35
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

-- 王磊 (demo-04): L3 🎯 AQ=90 — K22 H20 C18 S15 G15
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

-- 陈思 (demo-05): L3 🎯 AQ=110 — K25 H18 C22 S20 G25
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

-- 刘洋 (demo-06): L3 🎯 AQ=85 — K18 H22 C15 S12 G18
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

-- 赵琪 (demo-07): L2 🔬 AQ=65 — K15 H12 C10 S10 G18
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

-- 周杰 (demo-08): L2 🔬 AQ=55 — K12 H15 C8 S8 G12
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

-- 吴昊 (demo-09): L2 🔬 AQ=50 — K10 H8 C12 S10 G10
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

-- 林悦 (demo-10): L2 🔬 AQ=48 — K8 H10 C10 S8 G12
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

-- 黄丽 (demo-11): L1 🌱 AQ=28 — K5 H8 C5 S5 G5
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

-- 孙伟 (demo-12): L1 🌱 AQ=20 — K3 H5 C3 S5 G4
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

-- 郑芳 (demo-13): L1 🌱 AQ=15 — K5 H3 C2 S3 G2
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

-- 马骏 (demo-14): L1 🌱 AQ=12 — K2 H2 C3 S2 G3
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

-- Verify
SELECT '=== Demo Members ===' AS info;
SELECT m.id, m.display_name, ml.current_level,
  (SELECT SUM(period_score) FROM v2_member_dimension_scores ds
   WHERE ds.member_id = m.id
     AND ds.period_id IN (SELECT id FROM v2_periods WHERE ended_at IS NULL)) AS live_aq
FROM members m
LEFT JOIN v2_member_levels ml ON ml.member_id = m.id
WHERE m.id LIKE 'demo-%'
ORDER BY live_aq DESC;
