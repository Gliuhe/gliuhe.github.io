-- 限购功能数据库迁移脚本
-- 执行此脚本以添加限购支持

-- 1. 为 jixing_shop_products 表添加限购字段
ALTER TABLE jixing_shop_products
ADD COLUMN IF NOT EXISTS purchase_limit_period VARCHAR(20),
ADD COLUMN IF NOT EXISTS purchase_limit_count INTEGER;

-- 添加字段注释
COMMENT ON COLUMN jixing_shop_products.purchase_limit_period IS '限购周期：none(不限购), daily(每天), weekly(每周), monthly(每月)';
COMMENT ON COLUMN jixing_shop_products.purchase_limit_count IS '限购次数：每个周期内最多可购买次数';

-- 2. 创建购买记录表（用于限购统计）
CREATE TABLE IF NOT EXISTS jixing_shop_purchase_records (
    id UUID PRIMARY KEY,
    user_id TEXT NOT NULL,
    product_id UUID NOT NULL REFERENCES jixing_shop_products(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_purchase_records_user_product 
ON jixing_shop_purchase_records(user_id, product_id);

CREATE INDEX IF NOT EXISTS idx_purchase_records_created_at 
ON jixing_shop_purchase_records(created_at);

-- 添加表注释
COMMENT ON TABLE jixing_shop_purchase_records IS '纪行商城购买记录表，用于限购功能统计';

-- 3. 设置行级安全策略（RLS）
ALTER TABLE jixing_shop_purchase_records ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的购买记录
CREATE POLICY "用户只能查看自己的购买记录"
ON jixing_shop_purchase_records
FOR SELECT
USING (user_id = current_setting('request.jwt.claims')::json->>'sub');

-- 允许插入购买记录
CREATE POLICY "允许记录购买"
ON jixing_shop_purchase_records
FOR INSERT
WITH CHECK (user_id = current_setting('request.jwt.claims')::json->>'sub');

-- 4. 授予 anon 角色权限（如果需要通过 Supabase 客户端访问）
GRANT SELECT, INSERT ON jixing_shop_purchase_records TO anon;
