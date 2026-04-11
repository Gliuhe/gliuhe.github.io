/**
 * ========================================
 *  XiaoAn Cloud Store - 云存储适配器
 * ========================================
 * 
 * 功能：拦截所有 localStorage 读写，自动同步到 Supabase
 * 
 * 使用方法：
 *   1. 在 index.html 中 <script src="cloud-store.js"></script> （在主逻辑之前引入）
 *   2. 调用 CloudStore.init(userId) 初始化
 *   3. 原有代码无需任何修改！localStorage 读写会自动同步
 * 
 * 工作流程：
 *   页面加载 → 从 Supabase 拉取数据 → 写入 localStorage（作为缓存）
 *     ↓
 *   用户操作（如兑换商品）→ 写入 localStorage（立即响应）
 *     ↓ 同时
 *   队列写入 Supabase（异步，不阻塞UI）
 */

class CloudStore {
    constructor() {
        this.sb = null;
        this.userId = null;
        this.enabled = false;
        this.writeQueue = [];
        this.isProcessingQueue = false;
        
        // 需要同步的 key 映射（localStorage key → Supabase 表名）
        this.syncMap = {
            // 货币类 - 存入 user_currencies 表
            'voucher': { table: 'user_currencies', field: 'voucher' },
            'lottery': { table: 'user_currencies', field: 'lottery' },
            'premium': { table: 'user_currencies', field: 'premium' },
            'bankTicket': { table: 'user_currencies', field: 'bank_ticket' },
            
            // 配置类 - 存入 system_config 表
            'xiaoan_password': { table: 'system_config', field: 'main_password' },
            'rule_password': { table: 'system_config', field: 'rule_password' },
            'lottery_password': { table: 'system_config', field: 'lottery_password' },
            'advanced_password': { table: 'system_config', field: 'advanced_password' },
            'bank_password': { table: 'system_config', field: 'bank_password' },
            'announcement_password': { table: 'system_config', field: 'announcement_password' },
            'password': { table: 'system_config', field: 'main_password' }, // 别名
            
            // 利率配置
            'bankSavingsRate': { table: 'system_config', field: 'savings_rate' },
            'bankDepositRate': { table: 'system_config', field: 'deposit_rate' },
            'bankInvestmentRate': { table: 'system_config', field: 'investment_base_rate' },
            
            // 商品 - 存入 products 表
            'products': { table: 'products', type: 'json' },
            
            // 历史 - 存入 histories 表
            'history': { table: 'histories', type: 'json_array' },
            
            // 每日兑换
            'dailyExchange': { table: 'daily_exchanges', type: 'json' },
            'lastResetDate': { table: 'daily_exchanges', field: 'last_reset_date' },
            
            // 罚款
            'fineItems': { table: 'fine_items', type: 'json_array' },
            
            // 签到
            'checkinData': { table: 'checkin_data', type: 'json' },
            'checkinDates': { table: 'checkin_data', field: 'checkin_dates' },
            'streakDays': { table: 'checkin_data', field: 'streak_days' },
            'totalCheckins': { table: 'checkin_data', field: 'total_checkins' },
            
            // 银行
            'bankSavings': { table: 'bank_accounts', account_type: 'savings', field: 'balance' },
            'bankDeposit': { table: 'bank_accounts', account_type: 'deposit', field: 'balance' },
            'bankInvestment': { table: 'bank_accounts', account_type: 'investment', field: 'balance' },
            'savingsBalance': { table: 'bank_accounts', account_type: 'savings', field: 'balance' },
            'depositBalance': { table: 'bank_accounts', account_type: 'deposit', field: 'balance' },
            'investmentBalance': { table: 'bank_accounts', account_type: 'investment', field: 'balance' },
            'depositStartDate': { table: 'bank_accounts', account_type: 'deposit', field: 'start_date' },
            'investmentStartDate': { table: 'bank_accounts', account_type: 'investment', field: 'start_date' },
            'bankHistory': { table: 'bank_transactions', type: 'json_array' },
            'yesterdayEarnings_savings': { table: 'bank_accounts', account_type: 'savings', field: 'yesterday_earnings' },
            'yesterdayEarnings_deposit': { table: 'bank_accounts', account_type: 'deposit', field: 'yesterday_earnings' },
            'yesterdayEarnings_investment': { table: 'bank_accounts', account_type: 'investment', field: 'yesterday_earnings' },
            
            // 抽奖记录
            'lotteryRecords': { table: 'lottery_records', pool: 'normal', type: 'json_array' },
            'advancedLotteryRecords': { table: 'lottery_records', pool: 'advanced', type: 'json_array' },
            // 背包数据（与抽奖记录共用存储）
            'records': { table: 'histories', type: 'json_array', aliasFor: 'lotteryRecords' },
            'advancedRecords': { table: 'lottery_records', pool: 'advanced', type: 'json_array', aliasFor: 'advancedLotteryRecords' },
            'lastLotteryDate': { table: 'lottery_records', pool: 'normal', field: 'last_date' },
            'lastAdvancedLotteryDate': { table: 'lottery_records', pool: 'advanced', field: 'last_date' },
            'lotteryTicketCount': { table: 'lottery_records', pool: 'normal', field: 'ticket_count' },
            'premiumLottery': { table: 'lottery_records', pool: 'advanced', field: 'ticket_count' },
            
            // 计算挑战
            'jisuanCompleted': { table: 'jisuan_data', field: 'completed' },
            'jisuanScore': { table: 'jisuan_data', field: 'score' },
            'jisuanPassCards': { table: 'jisuan_data', field: 'pass_cards' },
            'jisuanHistory': { table: 'jisuan_data', field: 'history' },
            'jisuanLastResetDate': { table: 'jisuan_data', field: 'last_reset_date' },
            'jisuan_today': { table: 'jisuan_data', field: 'today' },
            // 下划线版本（兼容 jisuan.html）
            'jisuan_passCards': { table: 'jisuan_data', field: 'pass_cards' },
            'jisuan_history': { table: 'jisuan_data', field: 'history' },
            
            // 纪行（战斗通行证）
            'jixingCompletedDays': { table: 'jixing_progress', field: 'completed_days' },
            'jixingCurrency': { table: 'jixing_progress', field: 'currency' },
            'jixingInitialized': { table: 'jixing_progress', field: 'initialized' },
            'jixingGiftClaimed': { table: 'jixing_progress', field: 'gift_claimed' },
            'jixingBoughtRewards': { table: 'jixing_progress', field: 'bought_rewards' },
            
            // 清明活动
            'qingmingTasks': { table: 'qingming_data', type: 'json' },
            
            // 兑换历史
            'history': { table: 'histories', type: 'json_array' },
            
            // 任务规则（全局共享表）
            'rules': { table: 'rules', type: 'json_array' },
            
            // 活跃任务
            'activeTasks': { table: 'active_tasks', type: 'json' },
            
            // 其他状态
            'theme': { table: 'system_config', field: 'theme' },
            'lastVisitDate': { table: 'system_config', field: 'last_visit_date' },
            'lastInterestDate': { table: 'system_config', field: 'last_interest_date' },
            'bankInitialized': { table: 'system_config', field: 'bank_initialized' },
            'riskMaxProfit': { table: 'system_config', field: 'risk_max_profit' },
            'riskMinLoss': { table: 'system_config', field: 'risk_min_loss' },
        };
    }

    /**
     * 初始化云存储
     * @param {string} userId - 用户ID
     * @param {object} options - 可选配置
     */
    async init(userId, options = {}) {
        const SUPABASE_URL = 'https://qhnudlhpwmdzdxufcqjc.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFobnVkbGhwd21kemR4dWZjcWpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYzNzgzNSwiZXhwIjoyMDkxMjEzODM1fQ.WuH9mFVKKKQGFwjHBFO4NQhs6mL0oVRVlAlzGR5GYqc';

        console.log('[CloudStore] 🚀 init() 开始, userId=', userId);

        if (!userId) {
            console.warn('[CloudStore] 未提供 userId，使用纯 localStorage 模式');
            this.enabled = false;
            return;
        }

        // 检查 SDK
        console.log('[CloudStore] 检查 SDK... window.supabase=', typeof window.supabase);
        try {
            if (typeof window.supabase === 'undefined') {
                console.error('[CloudStore] ❌ Supabase SDK 未加载');
                this.enabled = false;
                return;
            }
            console.log('[CloudStore] ✅ SDK 已加载');

            this.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            this.userId = userId;
            this.enabled = true;

            console.log(`[CloudStore] ✅ 创建客户端成功 userId=${userId}`);

            // 从云端加载数据到本地
            console.log('[CloudStore] 📥 开始加载云端数据...');
            await this._loadFromCloud();
            console.log('[CloudStore] ✅ 云端数据加载完成');

            // 启动写队列处理
            this._processWriteQueue();

            // 监听页面关闭前，确保所有数据已保存
            window.addEventListener('beforeunload', () => {
                this._flushImmediate();
            });

        } catch (err) {
            console.error('[CloudStore] 初始化失败:', err);
            this.enabled = false;
        }
    }

    /**
     * 从 Supabase 加载所有数据到 localStorage
     */
    async _loadFromCloud() {
        console.log('[CloudStore] 📥 开始从云端加载数据...');
        let loadedCount = 0;

        try {
            // 1. 加载系统配置
            try { await this._loadSystemConfig(); loadedCount++; console.log('[CloudStore] ✅ 系统配置加载完成'); } catch(e) { console.warn('[CloudStore] ⚠️ 系统配置失败:', e.message); }

            // 2. 加载货币余额
            try { await this._loadCurrencies(); loadedCount++; console.log('[CloudStore] ✅ 货币加载完成'); } catch(e) { console.warn('[CloudStore] ⚠️ 货币失败:', e.message); }

            // 3. 加载商品列表
            try { await this._loadProducts(); loadedCount++; console.log('[CloudStore] ✅ 商品加载完成'); } catch(e) { console.warn('[CloudStore] ⚠️ 商品失败:', e.message); }

            // 4. 加载历史记录
            try { await this._loadHistory(); loadedCount++; console.log('[CloudStore] ✅ 历史记录加载完成'); } catch(e) { console.warn('[CloudStore] ⚠️ 历史记录失败:', e.message); }

            // 5. 加载每日兑换
            try { await this._loadDailyExchange(); loadedCount++; console.log('[CloudStore] ✅ 每日兑换加载完成'); } catch(e) { console.warn('[CloudStore] ⚠️ 每日兑换失败:', e.message); }

            // 6. 加载罚款项
            try { await this._loadFineItems(); loadedCount++; console.log('[CloudStore] ✅ 罚款项加载完成'); } catch(e) { console.warn('[CloudStore] ⚠️ 罚款项失败:', e.message); }

            // 7. 加载签到数据
            try { await this._loadCheckinData(); loadedCount++; console.log('[CloudStore] ✅ 签到数据加载完成'); } catch(e) { console.warn('[CloudStore] ⚠️ 签到数据失败:', e.message); }

            // 8. 加载银行数据
            try { await this._loadBankData(); loadedCount++; console.log('[CloudStore] ✅ 银行数据加载完成'); } catch(e) { console.warn('[CloudStore] ⚠️ 银行数据失败:', e.message); }

            // 9. 加载抽奖记录
            try { await this._loadLotteryData(); loadedCount++; console.log('[CloudStore] ✅ 抽奖记录加载完成'); } catch(e) { console.warn('[CloudStore] ⚠️ 抽奖记录失败:', e.message); }

            // 10. 加载计算挑战
            try { await this._loadJisuanData(); loadedCount++; console.log('[CloudStore] ✅ 计算挑战加载完成'); } catch(e) { console.warn('[CloudStore] ⚠️ 计算挑战失败:', e.message); }

            // 11. 加载纪行进度
            try { await this._loadJixingData(); loadedCount++; console.log('[CloudStore] ✅ 纪行进度加载完成'); } catch(e) { console.warn('[CloudStore] ⚠️ 纪行进度失败:', e.message); }

            // 12. 加载清明活动
            try { await this._loadQingmingData(); loadedCount++; console.log('[CloudStore] ✅ 清明活动加载完成'); } catch(e) { console.warn('[CloudStore] ⚠️ 清明活动失败:', e.message); }

            // 13. 加载兑换历史 + 任务规则 + 活跃任务
            try { await this._loadHistoryRulesTasks(); loadedCount++; console.log('[CloudStore] ✅ 历史/规则/任务加载完成'); } catch(e) { console.warn('[CloudStore] ⚠️ 历史/规则/任务失败:', e.message); }

            console.log(`[CloudStore] ✅ 云端加载完成 (${loadedCount} 个模块)`);

        } catch (err) {
            console.error('[CloudStore] ❌ 云端加载出错:', err);
            // 即使云端加载失败，也不影响本地操作（使用已有 localStorage 数据）
        }
    }

    // ========== 各模块的加载方法 ==========

    async _loadSystemConfig() {
        const { data, error } = await this.sb.from('system_config')
            .select('*').eq('user_id', this.userId).maybeSingle();

        if (error || !data) return; // 新用户无数据

        // 写入密码
        if (data.main_password) localStorage.setItem('xiaoan_password', String(data.main_password));
        if (data.password) localStorage.setItem('password', String(data.password));
        if (data.main_password) localStorage.setItem('xiaoan_password', String(data.main_password));
        
        // 配置项
        if (data.theme) localStorage.setItem('theme', data.theme);
        if (data.savings_rate) localStorage.setItem('bankSavingsRate', String(data.savings_rate));
        if (data.deposit_rate) localStorage.setItem('bankDepositRate', String(data.deposit_rate));
        if (data.investment_base_rate) localStorage.setItem('bankInvestmentRate', String(data.investment_base_rate));
        if (data.last_visit_date) localStorage.setItem('lastVisitDate', data.last_visit_date);
        if (data.risk_max_profit) localStorage.setItem('riskMaxProfit', String(data.risk_max_profit));
        if (data.risk_min_loss) localStorage.setItem('riskMinLoss', String(data.risk_min_loss));
    }

    async _loadCurrencies() {
        // 行级模型：每个货币类型一行（currency_type + amount）
        const { data, error } = await this.sb.from('user_currencies')
            .select('currency_type, amount').eq('user_id', this.userId);

        if (error || !data) return;

        data.forEach(row => {
            const key = row.currency_type;
            if (['voucher', 'lottery', 'premium', 'bankTicket'].includes(key)) {
                localStorage.setItem(key, String(row.amount));
            }
        });
    }

    async _loadProducts() {
        const { data, error } = await this.sb.from('products')
            .select('*');

        if (error) return;
        if (data && data.length > 0) {
            localStorage.setItem('products', JSON.stringify(data.map(p => ({
                id: p.id, name: p.name, price: p.price,
                dailyLimit: p.daily_limit || 0, availableDays: p.available_days || []
            }))));
        }
    }

    async _loadHistory() {
        const { data, error } = await this.sb.from('histories')
            .select('*').eq('user_id', this.userId).order('date', { ascending: true });

        if (error) return;
        if (data && data.length > 0) {
            localStorage.setItem('history', JSON.stringify(data.map(h => ({
                date: h.date, amount: h.amount, reason: h.reason,
                type: h.type, currencyType: h.currency_type,
                currencyName: h.currency_name, balanceAfter: h.balance_after,
                description: h.description
            }))));
        }
    }

    async _loadDailyExchange() {
        // daily_exchanges 是多行记录模型：每个 product_id + exchange_date 一行
        const todayStr = new Date().toISOString().split('T')[0];
        const { data, error } = await this.sb.from('daily_exchanges')
            .select('product_id, count').eq('user_id', this.userId)
            .eq('exchange_date', todayStr);

        if (error || !data || data.length === 0) return;
        
        // 转换为 { productId: count } 格式
        const exchangeData = {};
        data.forEach(r => {
            exchangeData[r.product_id] = r.count;
        });
        localStorage.setItem('dailyExchange', JSON.stringify(exchangeData));
    }

    async _loadFineItems() {
        const { data, error } = await this.sb.from('fine_items')
            .select('*').eq('user_id', this.userId).order('created_at', { ascending: true });

        if (error) return;
        if (data && data.length > 0) {
            localStorage.setItem('fineItems', JSON.stringify(data.map(f => ({
                id: f.id, reason: f.reason, total: f.original_amount,
                remaining: f.remaining, created: f.created_at,
                dueDate: f.due_date, penaltyApplied: f.penalty_applied
            }))));
        }
    }

    async _loadCheckinData() {
        const { data, error } = await this.sb.from('checkin_data')
            .select('*').eq('user_id', this.userId).maybeSingle();

        if (error || !data) return;

        if (data.checkin_dates) localStorage.setItem('checkinDates', JSON.stringify(data.checkin_dates));
        if (data.streak_days !== null) localStorage.setItem('streakDays', String(data.streak_days));
        if (data.total_checkins !== null) localStorage.setItem('totalCheckins', String(data.total_checkins));
    }

    async _loadBankData() {
        const { data, error } = await this.sb.from('bank_accounts')
            .select('*').eq('user_id', this.userId);

        if (error) return;
        if (data) {
            data.forEach(acc => {
                const key = acc.account_type === 'savings' ? 'bankSavings' :
                           acc.account_type === 'deposit' ? 'bankDeposit' : 'bankInvestment';
                if (acc.balance !== null) localStorage.setItem(key, String(acc.balance));
                
                if (acc.account_type === 'deposit' && acc.start_date) {
                    localStorage.setItem('depositStartDate', acc.start_date);
                }
                if (acc.account_type === 'investment' && acc.start_date) {
                    localStorage.setItem('investmentStartDate', acc.start_date);
                }
                if (acc.yesterday_earnings) {
                    localStorage.setItem(`yesterdayEarnings_${acc.account_type}`, String(acc.yesterday_earnings));
                }
            });
        }
        // 标记已初始化
        if (data && data.length > 0) {
            localStorage.setItem('bankInitialized', 'true');
        }

        // 加载银行流水
        const { data: txns, error: txnErr } = await this.sb.from('bank_transactions')
            .select('*').eq('user_id', this.userId).order('transaction_date', { ascending: false }).limit(500);
        if (!txnErr && txns && txns.length > 0) {
            localStorage.setItem('bankHistory', JSON.stringify(txns.map(t => ({
                type: t.type || 'deposit',
                accountType: t.account_type || 'savings',
                amount: t.amount || 0,
                description: t.description || '',
                date: t.transaction_date
            }))));
        }
    }

    async _loadLotteryData() {
        const { data, error } = await this.sb.from('lottery_records')
            .select('*').eq('user_id', this.userId).order('created_at', { ascending: true });

        if (error) return;
        if (data && data.length > 0) {
            const normal = data.filter(r => r.pool_type === 'normal' || r.pool_type === null);
            const advanced = data.filter(r => r.pool_type === 'advanced');

            if (normal.length > 0) {
                localStorage.setItem('lotteryRecords', JSON.stringify(normal.map(r => ({
                    prize: r.prize, date: r.date, cost: r.cost,
                    costType: r.cost_type, isGuaranteed: r.is_guaranteed,
                    used: r.used, usedTime: r.used_time
                }))));
            }
            if (advanced.length > 0) {
                localStorage.setItem('advancedLotteryRecords', JSON.stringify(advanced.map(r => ({
                    prize: r.prize, date: r.date, cost: r.cost,
                    costType: r.cost_type, isGuaranteed: r.is_guaranteed,
                    used: r.used, usedTime: r.used_time
                }))));
            }
        }
    }

    async _loadJisuanData() {
        const { data, error } = await this.sb.from('jisuan_data')
            .select('*').eq('user_id', this.userId).maybeSingle();

        if (error || !data) return;

        if (data.completed) localStorage.setItem('jisuanCompleted', 'true');
        if (data.score !== null) localStorage.setItem('jisuanScore', String(data.score));
        if (data.pass_cards !== null) {
            localStorage.setItem('jisuanPassCards', String(data.pass_cards));
            localStorage.setItem('jisuan_passCards', String(data.pass_cards));
        }
        if (data.history) {
            localStorage.setItem('jisuanHistory', JSON.stringify(data.history));
            localStorage.setItem('jisuan_history', JSON.stringify(data.history));
        }
        if (data.today) localStorage.setItem('jisuan_today', JSON.stringify(data.today));
    }

    async _loadJixingData() {
        const { data, error } = await this.sb.from('jixing_progress')
            .select('*').eq('user_id', this.userId).maybeSingle();

        if (error || !data) return;

        if (data.completed_days) localStorage.setItem('jixingCompletedDays', JSON.stringify(data.completed_days));
        if (data.currency !== null) localStorage.setItem('jixingCurrency', String(data.currency));
        if (data.initialized) localStorage.setItem('jixingInitialized', 'true');
        if (data.gift_claimed) localStorage.setItem('jixingGiftClaimed', 'true');
        if (data.bought_rewards) localStorage.setItem('jixingBoughtRewards', JSON.stringify(data.bought_rewards));
    }

    async _loadQingmingData() {
        const { data, error } = await this.sb.from('qingming_data')
            .select('*').eq('user_id', this.userId).maybeSingle();

        if (error || !data) return;
        if (data.completed_tasks) localStorage.setItem('qingmingTasks', JSON.stringify(data.completed_tasks));
    }

    async _loadHistoryRulesTasks() {
        // 并行加载历史、规则、活跃任务
        const [histRes, rulesRes, atasksRes] = await Promise.all([
            this.sb.from('histories').select('*').eq('user_id', this.userId).order('created_at', { ascending: true }).limit(500),
            this.sb.from('rules').select('*').order('sort_order', { ascending: true }),
            this.sb.from('active_tasks').select('*').eq('user_id', this.userId)
        ]);

        // 兑换历史（合并策略）
        if (!histRes.error && histRes.data?.length > 0) {
            const localHist = JSON.parse(localStorage.getItem('history') || '[]');
            const localKeys = new Set(localHist.map(h => (h.date||'') + '_' + (h.reason||'')));
            for (const h of histRes.data) {
                const k = (h.created_at||'') + '_' + (h.reason||'');
                if (!localKeys.has(k)) {
                    localHist.push({
                        date: h.created_at, amount: h.amount, reason: h.reason,
                        type: h.type, currencyType: h.currency_type,
                        currencyName: h.currency_name, balanceAfter: h.balance_after
                    });
                }
            }
            localStorage.setItem('history', JSON.stringify(localHist));
        }

        // 任务规则（全局共享）
        if (!rulesRes.error && rulesRes.data?.length > 0) {
            localStorage.setItem('rules', JSON.stringify(rulesRes.data.map(r => ({
                id: r.id, name: r.name, reward: typeof r.reward === 'string' ? r.reward : JSON.stringify(r.reward),
                duration: r.duration, days: r.days, is_daily: r.is_daily,
                rewardAmount: r.reward_amount, sortOrder: r.sort_order ?? r.id, isActive: r.is_active !== false
            }))));
        }

        // 活跃任务
        if (!atasksRes.error && atasksRes.data?.length > 0) {
            const taskObj = {};
            for (const t of atasksRes.data) {
                taskObj[t.rule_id] = {
                    status: t.status || 'pending',
                    startTime: t.start_time,
                    endTime: t.end_time,
                    rewardText: t.reward_text
                };
            }
            localStorage.setItem('activeTasks', JSON.stringify(taskObj));
        }
    }

    // ========== 同步写入方法 ==========

    /**
     * 将写入操作加入队列（异步同步到云端）
     */
    queueSync(key, value) {
        if (!this.enabled || !this.syncMap[key]) return;

        this.writeQueue.push({ key, value, timestamp: Date.now() });
        console.log(`[CloudStore] 📤 排队写入: ${key}`);
    }

    /**
     * 处理写队列
     */
    async _processWriteQueue() {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        while (this.writeQueue.length > 0) {
            const batch = this.writeQueue.splice(0, 10); // 每批最多10条
            
            for (const item of batch) {
                try {
                    await this._syncToCloud(item.key, item.value);
                    console.log(`[CloudStore] ✅ 已同步: ${item.key}`);
                } catch (err) {
                    console.error(`[CloudStore] ⚠️ 同步失败 ${item.key}:`, err.message);
                    // 失败不重试，避免无限循环
                }
            }

            // 批次间稍作延迟
            if (this.writeQueue.length > 0) {
                await new Promise(r => setTimeout(r, 200));
            }
        }

        this.isProcessingQueue = false;
    }

    /**
     * 将单个 key 的值同步到 Supabase
     */
    async _syncToCloud(key, value) {
        const config = this.syncMap[key];
        if (!config) return;

        // 处理别名：如果设置了 aliasFor，则使用目标配置
        const actualConfig = config.aliasFor ? this.syncMap[config.aliasFor] : config;
        const targetKey = config.aliasFor || key;

        switch (actualConfig.table) {
            case 'user_currencies':
                await this._syncCurrencies(targetKey, value);
                break;
            case 'system_config':
                await this._syncSystemConfig(key, value);
                break;
            case 'products':
                await this._syncProducts(value);
                break;
            case 'histories':
                await this._syncHistory(value);
                break;
            case 'rules':
                await this._syncRules(value);
                break;
            case 'active_tasks':
                await this._syncActiveTasks(value);
                break;
            case 'daily_exchanges':
                await this._syncDailyExchange(key, value);
                break;
            case 'fine_items':
                await this._syncFineItems(value);
                break;
            case 'checkin_data':
                await this._syncCheckinData(key, value);
                break;
            case 'bank_accounts':
                await this._syncBankAccounts(key, value);
                break;
            case 'bank_transactions':
                await this._syncBankHistory(value);
                break;
            case 'lottery_records':
                await this._syncLotteryRecords(targetKey, value);
                break;
            case 'jisuan_data':
                await this._syncJisuanData(key, value);
                break;
            case 'jixing_progress':
                await this._syncJixingData(key, value);
                break;
            case 'qingming_data':
                await this._syncQingmingData(key, value);
                break;
            default:
                console.warn(`[CloudStore] 未知的表: ${config.table}`);
        }
    }

    // ========== 各模块的同步方法 ==========

    async _syncCurrencies(key, value) {
        // 行级模型：每货币一行 (currency_type + amount)
        if (!['voucher', 'lottery', 'premium', 'bankTicket'].includes(key)) return;

        await this.sb.from('user_currencies').upsert({
            user_id: this.userId,
            currency_type: key,
            amount: parseInt(value) || 0
        }, { onConflict: 'user_id,currency_type' });
    }

    async _syncSystemConfig(key, value) {
        const fieldMap = {
            xiaoan_password: 'main_password', password: 'main_password',
            theme: 'theme',
            bankSavingsRate: 'savings_rate', bankDepositRate: 'deposit_rate',
            bankInvestmentRate: 'investment_base_rate',
            lastVisitDate: 'last_visit_date',
            riskMaxProfit: 'risk_max_profit', riskMinLoss: 'risk_min_loss',
            bankInitialized: 'bank_initialized'
        };
        const dbField = fieldMap[key];
        if (!dbField) return;

        let syncValue = value;
        if (['savings_rate', 'deposit_rate', 'investment_base_rate'].includes(dbField)) {
            syncValue = parseFloat(value) || 0;
        } else if (dbField === 'bank_initialized') {
            syncValue = value === 'true';
        }

        await this.sb.from('system_config').upsert({
            user_id: this.userId,
            [dbField]: syncValue
        }, { onConflict: 'user_id' });
    }

    async _syncProducts(value) {
        const products = typeof value === 'string' ? JSON.parse(value) : value;
        if (!Array.isArray(products)) return;

        for (const p of products) {
            await this.sb.from('products').upsert({
                id: p.id,
                name: p.name,
                price: p.price,
                daily_limit: p.daily_limit || 0,
                available_days: p.availableDays || p.days || []
            }, { onConflict: 'id' });
        }
    }

    async _syncDailyExchange(key, value) {
        if (key === 'dailyExchange') {
            const exchangeData = typeof value === 'string' ? JSON.parse(value) : value;
            const todayStr = new Date().toISOString().split('T')[0];
            for (const [productId, count] of Object.entries(exchangeData)) {
                await this.sb.from('daily_exchanges').upsert({
                    user_id: this.userId,
                    product_id: parseInt(productId),
                    exchange_date: todayStr,
                    count: parseInt(count) || 1
                }, { onConflict: 'user_id,product_id,exchange_date' });
            }
        } else if (key === 'lastResetDate') {
            // lastResetDate 不再单独存储（已融入 daily_exchanges 的日期字段）
        }
    }

    async _syncFineItems(value) {
        const items = typeof value === 'string' ? JSON.parse(value) : value;
        if (!Array.isArray(items)) return;

        // 先删除旧数据，再插入新数据
        await this.sb.from('fine_items').delete().eq('user_id', this.userId);
        
        const records = items.map(item => ({
            user_id: this.userId,
            id: item.id,
            reason: item.reason,
            original_amount: item.total,
            remaining: item.remaining,
            created_at: item.created,
            due_date: item.dueDate || item.dueDate,
            penalty_applied: item.penaltyApplied || false,
            is_paid: false, paid_amount: 0
        }));

        if (records.length > 0) {
            await this.sb.from('fine_items').insert(records);
        }
    }

    async _syncCheckinData(key, value) {
        const baseData = { user_id: this.userId };
        
        if (key === 'checkinDates') {
            baseData.checkin_dates = typeof value === 'string' ? JSON.parse(value) : value;
        } else if (['streakDays', 'totalCheckins'].includes(key)) {
            baseData[key === 'streakDays' ? 'streak_days' : 'total_checkins'] = parseInt(value) || 0;
        }

        await this.sb.from('checkin_data').upsert(baseData, { onConflict: 'user_id' });
    }

    async _syncBankAccounts(key, value) {
        const accTypeMap = {
            'bankSavings': 'savings', 'savingsBalance': 'savings',
            'bankDeposit': 'deposit', 'depositBalance': 'deposit',
            'bankInvestment': 'investment', 'investmentBalance': 'investment'
        };
        const accType = accTypeMap[key];
        if (accType) {
            await this.sb.from('bank_accounts').upsert({
                user_id: this.userId,
                account_type: accType,
                balance: parseInt(value) || 0
            }, { onConflict: 'user_id,account_type' });
        }

        // 处理日期字段
        if (key === 'depositStartDate') {
            await this.sb.from('bank_accounts').upsert({
                user_id: this.userId, account_type: 'deposit', start_date: value
            }, { onConflict: 'user_id,account_type' });
        }
        if (key === 'investmentStartDate') {
            await this.sb.from('bank_accounts').upsert({
                user_id: this.userId, account_type: 'investment', start_date: value
            }, { onConflict: 'user_id,account_type' });
        }
    }

    async _syncBankHistory(value) {
        const historyArr = typeof value === 'string' ? JSON.parse(value) : value;
        if (!Array.isArray(historyArr) || historyArr.length === 0) return;

        // 先删除旧记录，再批量写入
        await this.sb.from('bank_transactions').delete().eq('user_id', this.userId);
        const txns = historyArr.map(h => ({
            user_id: this.userId,
            type: h.type || 'deposit',
            account_type: h.accountType || 'savings',
            amount: parseFloat(h.amount) || 0,
            description: h.description || '',
            transaction_date: h.date || h.time || new Date().toISOString()
        }));
        await this.sb.from('bank_transactions').insert(txns);
    }

    async _syncLotteryRecords(key, value) {
        const poolType = key === 'advancedLotteryRecords' ? 'advanced' : 'normal';
        const records = typeof value === 'string' ? JSON.parse(value) : value;
        if (!Array.isArray(records) || records.length === 0) return;

        // 删除该用户该奖池的旧记录
        await this.sb.from('lottery_records').delete()
            .eq('user_id', this.userId).eq('pool_type', poolType);

        const rows = records.map(r => ({
            user_id: this.userId, pool_type: poolType,
            prize_name: r.prizeName || r.name || r.prize_name || '未知奖品',
            used: !!r.used,
            prize_date: r.date || r.claimedAt || new Date().toISOString()
        }));
        await this.sb.from('lottery_records').insert(rows);
    }

    async _syncJisuanData(key, value) {
        const fieldMap = {
            jisuanCompleted: 'completed', jisuanScore: 'score',
            jisuanPassCards: 'pass_cards', jisuanHistory: 'history',
            jisuan_today: 'today',
            // 下划线版本
            jisuan_passCards: 'pass_cards', jisuan_history: 'history'
        };
        const dbField = fieldMap[key];
        if (!dbField) return;

        let syncValue = value;
        if (key === 'jisuanCompleted') syncValue = value === 'true';
        else if (['jisuanScore', 'jisuanPassCards', 'jisuan_passCards'].includes(key)) syncValue = parseInt(value) || 0;
        else if (['jisuanHistory', 'jisuan_today', 'jisuan_history'].includes(key)) {
            syncValue = typeof value === 'string' ? JSON.parse(value) : value;
        }

        await this.sb.from('jisuan_data').upsert({
            user_id: this.userId,
            [dbField]: syncValue
        }, { onConflict: 'user_id' });
    }

    async _syncJixingData(key, value) {
        const fieldMap = {
            jixingCompletedDays: 'completed_days', jixingCurrency: 'currency',
            jixingInitialized: 'initialized', jixingGiftClaimed: 'gift_claimed',
            jixingBoughtRewards: 'bought_rewards'
        };
        const dbField = fieldMap[key];
        if (!dbField) return;

        let syncValue = value;
        if (['jixingInitialized', 'jixingGiftClaimed'].includes(key)) {
            syncValue = value === 'true';
        } else if (key === 'jixingCurrency') {
            syncValue = parseInt(value) || 0;
        } else if (['jixingCompletedDays', 'jixingBoughtRewards'].includes(key)) {
            syncValue = typeof value === 'string' ? JSON.parse(value) : value;
        }

        await this.sb.from('jixing_progress').upsert({
            user_id: this.userId,
            [dbField]: syncValue
        }, { onConflict: 'user_id' });
    }

    async _syncQingmingData(key, value) {
        if (key === 'qingmingTasks') {
            const tasks = typeof value === 'string' ? JSON.parse(value) : value;
            await this.sb.from('qingming_data').upsert({
                user_id: this.userId,
                completed_tasks: tasks
            }, { onConflict: 'user_id' });
        }
    }

    async _syncHistory(value) {
        const arr = typeof value === 'string' ? JSON.parse(value) : value;
        if (!Array.isArray(arr) || arr.length === 0) return;
        await this.sb.from('histories').delete().eq('user_id', this.userId);
        const records = arr.map(h => ({
            user_id: this.userId,
            amount: parseInt(h.amount) || 0,
            reason: h.reason || '',
            type: h.type || 'exchange',
            currency_type: h.currencyType || 'voucher',
            currency_name: h.currencyName || '代金券',
            balance_after: parseInt(h.balanceAfter) || 0,
            created_at: h.date || h.time || new Date().toISOString()
        }));
        if (records.length > 0) await this.sb.from('histories').insert(records);
    }

    async _syncRules(value) {
        const rules = typeof value === 'string' ? JSON.parse(value) : value;
        if (!Array.isArray(rules) || rules.length === 0) return;
        await this.sb.from('rules').delete();
        const rows = rules.map(r => ({
            id: r.id, name: r.name || '',
            reward: r.reward || '{}',
            duration: parseInt(r.duration) || 0,
            days: Array.isArray(r.days) ? r.days : [],
            is_daily: !!r.is_daily,
            reward_amount: parseInt(r.rewardAmount) || 0,
            sort_order: parseInt(r.sortOrder) ?? r.id,
            is_active: r.isActive !== false
        }));
        await this.sb.from('rules').insert(rows);
    }

    async _syncActiveTasks(value) {
        const tasks = typeof value === 'string' ? JSON.parse(value) : value;
        if (!tasks || typeof tasks !== 'object') return;
        await this.sb.from('active_tasks').delete().eq('user_id', this.userId);
        const rows = [];
        for (const [ruleId, td] of Object.entries(tasks)) {
            if (td && typeof td === 'object') {
                rows.push({
                    user_id: this.userId,
                    rule_id: parseInt(ruleId) || 0,
                    status: td.status || 'pending',
                    start_time: td.startTime || null,
                    end_time: td.endTime || null,
                    reward_text: td.rewardText || ''
                });
            }
        }
        if (rows.length > 0) await this.sb.from('active_tasks').insert(rows);
    }

    /**
     * 页面关闭前强制刷新队列
     */
    _flushImmediate() {
        if (this.writeQueue.length > 0) {
            console.log(`[CloudStore] 💾 页面关闭，还有 ${this.writeQueue.length} 条待同步`);
            // 使用 sendBeacon 或 fetch keepalive 尝试发送
            // 由于 Supabase 不支持 beacon，这里只能尽力而为
        }
    }

    /**
     * 手动触发一次完整的全量同步（localStorage → Supabase）
     */
    async fullSync() {
        if (!this.enabled) return;
        console.log('[CloudStore] 🔄 开始全量同步...');

        for (const key of Object.keys(this.syncMap)) {
            const value = localStorage.getItem(key);
            if (value !== null) {
                this.queueSync(key, value);
            }
        }

        await this._processWriteQueue();
        console.log('[CloudStore] ✅ 全量同步完成');
    }
}

// ========== 全局实例 + localStorage 拦截器 ==========

window.CloudStore = new CloudStore();

// 保存原始方法引用
const _originalGetItem = localStorage.getItem.bind(localStorage);
const _originalSetItem = localStorage.setItem.bind(localStorage);
const _originalRemoveItem = localStorage.removeItem.bind(localStorage);

/**
 * 重写 localStorage.setItem - 自动同步到云端
 */
localStorage.setItem = function(key, value) {
    // 先执行原始操作（保证本地可用）
    _originalSetItem.call(this, key, value);
    
    // 优先使用 index.html 中建立的直接写入通道（更可靠）
    if (typeof _directWriteToCloud === 'function' && window.__cloudClient) {
        // 异步执行，不阻塞UI
        setTimeout(() => _directWriteToCloud(key, value), 0);
    } 
    // 备用：通过 CloudStore 队列
    else if (window.CloudStore && window.CloudStore.enabled) {
        window.CloudStore.queueSync(key, value);
    }
};

/**
 * 保持 getItem 原样不变（从本地缓存读取即可）
 * 如需强制刷新可调用 CloudStore.init()
 */
localStorage.getItem = function(key) {
    return _originalGetItem.call(this, key);
};

/**
 * 保持 removeItem 原样 + 通知云存储
 */
localStorage.removeItem = function(key) {
    _originalRemoveItem.call(this, key);
    
    if (window.CloudStore && window.CloudStore.enabled) {
        // 删除时设为空值或特殊标记
        window.CloudStore.queueSync(key, '');
    }
};

console.log('[CloudStore] 🔌 localStorage 拦截器已激活');
