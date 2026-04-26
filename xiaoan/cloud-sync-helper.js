/**
 * 精简版云同步助手 - 只保留核心功能
 * 保留：罚款、登录、奖池配置、兑换码、邮件/通知、封禁
 * UUID固定: d71f9173-bd5d-4d30-a033-0429ae162fd7
 */

var USER_ID = 'd71f9173-bd5d-4d30-a033-0429ae162fd7';

function _getSb() {
    if (typeof window.supabase === 'undefined') return null;
    return window.supabase.createClient('https://qhnudlhpwmdzdxufcqjc.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFobnVkbGhwd21kemR4dWZjcWpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYzNzgzNSwiZXhwIjoyMDkxMjEzODM1fQ.WuH9mFVKKKQGFwjHBFO4NQhs6mL0oVRVlAlzGR5GYqc');
}

// ===== 罚款同步 =====

// 从云端加载罚款数据
async function loadFinesFromCloud() {
    try {
        var sb = _getSb();
        if (!sb) return [];
        
        var { data, error } = await sb.from('fine_items')
            .select('*')
            .eq('user_id', USER_ID)
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            localStorage.setItem('fineItems', JSON.stringify(data.map(function(f) {
                return {
                    id: f.id,
                    reason: f.reason,
                    total: f.original_amount,
                    remaining: f.remaining,
                    created: f.created_at,
                    dueDate: f.due_date,
                    penaltyApplied: f.penalty_applied || false,
                    isPaid: f.is_paid === true,
                    paidAmount: f.paid_amount || 0
                };
            })));
        }
        
        window._finesCache = data || [];
        console.log('[sync] ✅ 罚款数据已加载');
        return data || [];
    } catch (e) {
        console.warn('[sync] ⚠️ 加载罚款失败:', e);
        return [];
    }
}

// 更新罚款到云端（缴纳罚款）
async function updateFineToCloud(fineId, updates) {
    try {
        var sb = _getSb();
        if (!sb) return false;
        
        var { error } = await sb.from('fine_items')
            .update(updates)
            .eq('id', fineId);
        
        if (error) throw error;
        
        // 刷新本地缓存
        await loadFinesFromCloud();
        return true;
    } catch (e) {
        console.error('[sync] ❌ 更新罚款失败:', e);
        return false;
    }
}

// ===== 兑换码同步 =====

// 验证兑换码
async function validateExchangeCode(code) {
    try {
        var sb = _getSb();
        if (!sb) return { valid: false, error: '无法连接服务器' };
        
        var { data, error } = await sb.from('exchange_codes')
            .select('*')
            .eq('code', code.toUpperCase())
            .maybeSingle();
        
        if (error) throw error;
        
        if (!data) {
            return { valid: false, error: '兑换码无效' };
        }
        
        if (data.is_used) {
            return { valid: false, error: '该兑换码已被使用' };
        }
        
        return { valid: true, codeData: data };
    } catch (e) {
        console.error('[sync] ⚠️ 验证兑换码失败:', e);
        return { valid: false, error: e.message };
    }
}

// 标记兑换码已使用
async function markExchangeCodeUsed(code, userId) {
    try {
        var sb = _getSb();
        if (!sb) return false;
        
        var { error } = await sb.from('exchange_codes')
            .update({
                is_used: true,
                used_at: new Date().toISOString(),
                used_by: userId
            })
            .eq('code', code);
        
        if (error) throw error;
        return true;
    } catch (e) {
        console.error('[sync] ❌ 标记兑换码失败:', e);
        return false;
    }
}

// ===== 奖池配置同步 (lottery_config) =====

// 加载奖池配置
async function loadLotteryConfigFromCloud() {
    try {
        var sb = _getSb();
        if (!sb) return null;
        
        var { data, error } = await sb.from('lottery_config')
            .select('*')
            .eq('id', 1)
            .maybeSingle();
        
        if (error) throw error;
        
        if (data && data.config) {
            localStorage.setItem('lottery_reward_config', JSON.stringify(data.config));
            localStorage.setItem('lottery_config_version', String(data.updated_at || Date.now()));
            console.log('[sync] ✅ 奖池配置已加载');
            return data.config;
        }
        
        return null;
    } catch (e) {
        console.warn('[sync] ⚠️ 加载奖池配置失败:', e);
        return null;
    }
}

// 保存奖池配置到云端
async function saveLotteryConfigToCloud(config) {
    try {
        var sb = _getSb();
        if (!sb) return false;
        
        var now = new Date().toISOString();
        
        var { error } = await sb.from('lottery_config').upsert({
            id: 1,
            config: config,
            updated_at: now
        }, { onConflict: 'id' });
        
        if (error) throw error;
        
        localStorage.setItem('lottery_reward_config', JSON.stringify(config));
        localStorage.setItem('lottery_config_version', now);
        console.log('[sync] ✅ 奖池配置已保存');
        return true;
    } catch (e) {
        console.error('[sync] ❌ 保存奖池配置失败:', e);
        return false;
    }
}

// ===== 邮件/通知同步 =====

// 加载邮件列表
async function loadMailsFromCloud() {
    try {
        var sb = _getSb();
        if (!sb) return [];
        
        var { data, error } = await sb.from('mails')
            .select('*')
            .eq('user_id', USER_ID)
            .order('created_at', { ascending: false })
            .limit(100);
        
        if (error) throw error;
        
        return data || [];
    } catch (e) {
        console.warn('[sync] ⚠️ 加载邮件失败:', e);
        return [];
    }
}

// 标记邮件已读
async function markMailRead(mailId) {
    try {
        var sb = _getSb();
        if (!sb) return false;
        
        var { error } = await sb.from('mails')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', mailId);
        
        if (error) throw error;
        return true;
    } catch (e) {
        console.error('[sync] ❌ 标记邮件已读失败:', e);
        return false;
    }
}

// 领取邮件附件奖励
async function claimMailReward(mailId) {
    try {
        var sb = _getSb();
        if (!sb) return false;
        
        var { error } = await sb.from('mails')
            .update({ reward_claimed: true, claimed_at: new Date().toISOString() })
            .eq('id', mailId);
        
        if (error) throw error;
        return true;
    } catch (e) {
        console.error('[sync] ❌ 领取附件失败:', e);
        return false;
    }
}

// 发送通知
async function sendNotification(userId, type, title, body, attachment) {
    try {
        var sb = _getSb();
        if (!sb) return false;
        
        var { error } = await sb.from('notifications').insert({
            user_id: userId,
            type: type,
            title: title,
            body: body,
            attachment: attachment || null,
            created_at: new Date().toISOString(),
            is_read: false
        });
        
        if (error) throw error;
        return true;
    } catch (e) {
        console.error('[sync] ❌ 发送通知失败:', e);
        return false;
    }
}

// ===== 封禁系统同步 =====

// 检查用户是否被封禁
async function checkUserBan(feature) {
    try {
        var sb = _getSb();
        if (!sb) return { banned: false };
        
        var { data, error } = await sb.from('user_bans')
            .select('*')
            .eq('user_id', USER_ID)
            .order('banned_at', { ascending: false })
            .limit(1);
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            return { banned: false };
        }
        
        var ban = data[0];
        var now = new Date();
        var expiresAt = ban.expires_at ? new Date(ban.expires_at) : null;
        var isExpired = expiresAt && expiresAt < now;
        
        if (isExpired) {
            return { banned: false };
        }
        
        if (feature && ban.restrictions && !ban.restrictions[feature]) {
            return { banned: false };
        }
        
        return {
            banned: true,
            reason: ban.reason,
            expiresAt: ban.expires_at,
            restrictions: ban.restrictions || {}
        };
    } catch (e) {
        console.warn('[sync] ⚠️ 检查封禁状态失败:', e);
        return { banned: false };
    }
}

// 显示封禁提示并跳转
function showBanMessage(banInfo) {
    var message = '🚫 您已被封禁\n\n';
    message += '原因：' + (banInfo.reason || '违反规则') + '\n';
    
    if (banInfo.expiresAt) {
        message += '到期时间：' + new Date(banInfo.expiresAt).toLocaleString() + '\n';
    } else {
        message += '封禁类型：永久封禁\n';
    }
    
    var restrictions = banInfo.restrictions || {};
    var restrictedFeatures = [];
    if (restrictions.lottery) restrictedFeatures.push('抽奖');
    if (restrictions.jixing) restrictedFeatures.push('纪行');
    if (restrictions.bank) restrictedFeatures.push('银行');
    if (restrictions.shop) restrictedFeatures.push('商店');
    
    if (restrictedFeatures.length > 0) {
        message += '\n限制功能：' + restrictedFeatures.join('、');
    }
    
    alert(message);
    window.location.href = '../index.html';
}

// 页面封禁检查
async function checkPageBan(feature) {
    var banInfo = await checkUserBan(feature);
    if (banInfo.banned) {
        showBanMessage(banInfo);
        return true;
    }
    return false;
}

// ===== 页面同步初始化（精简版）=====
var _syncInitialized = false;

async function syncOnPageEnter(pageName) {
    console.log('[sync] 📥 页面进入同步:', pageName);
    
    try {
        // 根据页面类型加载必要数据
        switch (pageName) {
            case 'index':
            case 'bag':
                await loadFinesFromCloud();
                break;
            case 'lottery':
                await loadLotteryConfigFromCloud();
                break;
        }
        
        console.log('[sync] ✅ 页面进入同步完成');
    } catch (e) {
        console.warn('[sync] ⚠️ 页面进入同步失败:', e);
    }
}

function syncOnPageExit(pageName) {
    console.log('[sync] 📤 页面退出同步:', pageName);
    // 精简模式下退出时不需要主动上传
}

function initPageSync(pageName) {
    if (_syncInitialized) return;
    _syncInitialized = true;
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            syncOnPageEnter(pageName);
        });
    } else {
        syncOnPageEnter(pageName);
    }
}

// ===== 导出函数到全局 =====
window.checkUserBan = checkUserBan;
window.showBanMessage = showBanMessage;
window.checkPageBan = checkPageBan;
window.loadLotteryConfigFromCloud = loadLotteryConfigFromCloud;
window.saveLotteryConfigToCloud = saveLotteryConfigToCloud;
window.loadFinesFromCloud = loadFinesFromCloud;

window.sendNotification = sendNotification;
window.loadMailsFromCloud = loadMailsFromCloud;
window.initPageSync = initPageSync;
