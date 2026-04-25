var CLOUD_SYNC_KEYS=['voucher','lottery','premium','bankTicket','jixing_muchun_currency'];
var BANK_ACC_MAP={bankSavings:'savings',savingsBalance:'savings',bankDeposit:'deposit',depositBalance:'deposit',bankInvestment:'investment',investmentBalance:'investment'};
var USER_ID='d71f9173-bd5d-4d30-a033-0429ae162fd7';
var _syncInitialized=false;

function _getSb(){
    if(typeof window.supabase==='undefined')return null;
    return window.supabase.createClient('https://qhnudlhpwmdzdxufcqjc.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFobnVkbGhwd21kemR4dWZjcWpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYzNzgzNSwiZXhwIjoyMDkxMjEzODM1fQ.WuH9mFVKKKQGFwjHBFO4NQhs6mL0oVRVlAlzGR5GYqc');
}
function syncCurrencyToCloud(key){
    try{
        var sb=_getSb();if(!sb)return;
        var val=parseInt(localStorage.getItem(key))||0;
        if(['voucher','lottery','premium','bankTicket','jixing_muchun_currency'].indexOf(key)>=0){
            sb.from('user_currencies').upsert({user_id:USER_ID,currency_type:key,amount:val},{onConflict:'user_id,currency_type'}).then(function(r){if(r.error)console.warn('[sync] ⚠️ 货币同步失败:',key,r.error.message)});
        }
    }catch(e){}
}
function syncBankAccountToCloud(key){
    try{
        var sb=_getSb();if(!sb)return;
        var accType=BANK_ACC_MAP[key];
        if(accType){
            var val=parseInt(localStorage.getItem(key))||0;
            sb.from('bank_accounts').upsert({user_id:USER_ID,account_type:accType,balance:val},{onConflict:'user_id,account_type'}).then(function(r){if(r.error)console.warn('[sync] ⚠️ 银行账户同步失败:',key,r.error.message)});
        }
        if(key==='depositStartDate'){
            sb.from('bank_accounts').upsert({user_id:USER_ID,account_type:'deposit',start_date:localStorage.getItem(key)||''},{onConflict:'user_id,account_type'}).then(function(){});
        }
        if(key==='investmentStartDate'){
            sb.from('bank_accounts').upsert({user_id:USER_ID,account_type:'investment',start_date:localStorage.getItem(key)||''},{onConflict:'user_id,account_type'}).then(function(){});
        }
    }catch(e){}
}
function syncBankHistoryToCloud(){
    try{
        var sb=_getSb();if(!sb)return;
        var raw=localStorage.getItem('bankTransactions')||localStorage.getItem('bankHistory')||'[]';
        var arr=typeof raw==='string'?JSON.parse(raw):raw;
        if(!Array.isArray(arr)||arr.length===0)return;
        var txns=arr.map(function(h){return{user_id:USER_ID,type:h.type||'deposit',account_type:h.accountType||'savings',amount:parseFloat(h.amount)||0,description:h.description||'',transaction_date:h.date||h.time||new Date().toISOString()}});
        sb.from('bank_transactions').delete().eq('user_id',USER_ID).then(function(){
            sb.from('bank_transactions').insert(txns).then(function(r){if(r.error)console.warn('[sync] ⚠️ 银行历史同步失败:',r.error.message)});
        });
    }catch(e){}
}
function syncAllCurrenciesToCloud(){
    for(var i=0;i<CLOUD_SYNC_KEYS.length;i++)syncCurrencyToCloud(CLOUD_SYNC_KEYS[i]);
}
function syncAllBankToCloud(){
    var keys=Object.keys(BANK_ACC_MAP);
    for(var i=0;i<keys.length;i++)syncBankAccountToCloud(keys[i]);
    syncBankHistoryToCloud();
}
function syncJixingProgressToCloud(){
    try{
        var sb=_getSb();if(!sb)return;
        var raw=localStorage.getItem('jixingCompletedDays');
        if(!raw)return;
        var days=typeof raw==='string'?JSON.parse(raw):raw;
        if(!Array.isArray(days))return;
        sb.from('jixing_progress').upsert({user_id:USER_ID,completed_days:days},{onConflict:'user_id'}).then(function(r){if(r.error)console.warn('[sync] ⚠️ 纪行进度同步失败:',r.error.message)});
    }catch(e){}
}
function syncActiveTasksToCloud(){
    try{
        var sb=_getSb();if(!sb)return;
        var raw=localStorage.getItem('activeTasks');
        if(!raw)return;
        var tasks=typeof raw==='string'?JSON.parse(raw):raw;
        if(!tasks||typeof tasks!=='object')return;
        sb.from('active_tasks').delete().eq('user_id',USER_ID).then(function(){
            var rows=[];
            for(var ruleId in tasks){
                var td=tasks[ruleId];
                if(td&&typeof td==='object'){
                    rows.push({user_id:USER_ID,rule_id:parseInt(ruleId)||0,status:td.status||'pending',start_time:td.startTime||null,end_time:td.endTime||null,reward_text:td.rewardText||''});
                }
            }
            if(rows.length>0)sb.from('active_tasks').insert(rows).then(function(r){if(r.error)console.warn('[sync] ⚠️ 任务同步失败:',r.error.message)});
        });
    }catch(e){}
}

// ===== 页面进入/退出同步功能 =====

// 从云端加载所有货币数据
async function loadAllCurrenciesFromCloud() {
    try {
        var sb = _getSb();
        if (!sb) return;
        
        var { data, error } = await sb.from('user_currencies')
            .select('currency_type, amount')
            .eq('user_id', USER_ID);
        
        if (error) {
            console.warn('[sync] ⚠️ 加载货币失败:', error.message);
            return;
        }
        
        if (data && data.length > 0) {
            data.forEach(function(row) {
                if (CLOUD_SYNC_KEYS.indexOf(row.currency_type) >= 0) {
                    localStorage.setItem(row.currency_type, String(row.amount || 0));
                    console.log('[sync] 📥 加载货币:', row.currency_type, '=', row.amount);
                }
            });
        }
    } catch (e) {
        console.warn('[sync] ⚠️ 加载货币异常:', e);
    }
}

// 从云端加载银行数据
async function loadBankFromCloud() {
    try {
        var sb = _getSb();
        if (!sb) return;
        
        var { data, error } = await sb.from('bank_accounts')
            .select('*')
            .eq('user_id', USER_ID);
        
        if (error) {
            console.warn('[sync] ⚠️ 加载银行数据失败:', error.message);
            return;
        }
        
        if (data && data.length > 0) {
            data.forEach(function(row) {
                var localKey = Object.keys(BANK_ACC_MAP).find(function(k) { 
                    return BANK_ACC_MAP[k] === row.account_type; 
                });
                if (localKey && row.balance !== undefined) {
                    localStorage.setItem(localKey, String(row.balance));
                    console.log('[sync] 📥 加载银行账户:', localKey, '=', row.balance);
                }
            });
        }
    } catch (e) {
        console.warn('[sync] ⚠️ 加载银行数据异常:', e);
    }
}

// 页面进入时同步（从云端读取数据）
async function syncOnPageEnter(pageName) {
    console.log('[sync] 🚀 页面进入同步:', pageName || document.location.pathname);
    
    try {
        // 并行加载所有数据
        await Promise.all([
            loadAllCurrenciesFromCloud(),
            loadBankFromCloud()
        ]);
        
        console.log('[sync] ✅ 页面进入同步完成');
    } catch (e) {
        console.warn('[sync] ⚠️ 页面进入同步失败:', e);
    }
}

// 页面退出时同步（上传数据到云端）
function syncOnPageExit(pageName) {
    console.log('[sync] 📤 页面退出同步:', pageName || document.location.pathname);
    
    try {
        // 同步所有货币
        syncAllCurrenciesToCloud();
        
        // 同步银行数据
        syncAllBankToCloud();
        
        // 同步任务状态
        syncActiveTasksToCloud();
        
        // 同步纪行进度
        syncJixingProgressToCloud();
        
        console.log('[sync] ✅ 页面退出同步完成');
    } catch (e) {
        console.warn('[sync] ⚠️ 页面退出同步失败:', e);
    }
}

// 初始化页面同步（自动注册进入/退出事件）
function initPageSync(pageName) {
    if (_syncInitialized) {
        console.log('[sync] 已初始化，跳过重复初始化');
        return;
    }
    _syncInitialized = true;
    
    // 页面加载时同步
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            syncOnPageEnter(pageName);
        });
    } else {
        syncOnPageEnter(pageName);
    }
    
    // 页面隐藏时同步（切换标签页/最小化）
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            syncOnPageExit(pageName);
        }
    });
    
    // 页面卸载前同步（关闭页面/跳转）
    window.addEventListener('beforeunload', function() {
        syncOnPageExit(pageName);
    });
    
    // 页面卸载时同步（后备）
    window.addEventListener('unload', function() {
        syncOnPageExit(pageName);
    });
    
    console.log('[sync] ✅ 页面同步已初始化:', pageName || document.location.pathname);
}

// 手动触发完整同步
async function forceFullSync() {
    console.log('[sync] 🔄 手动触发完整同步...');
    
    // 先上传
    syncOnPageExit('manual');
    
    // 再下载
    await syncOnPageEnter('manual');
    
    console.log('[sync] ✅ 完整同步完成');
}

// ===== 封禁检查功能 =====

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
        
        if (error) {
            console.warn('[sync] ⚠️ 检查封禁状态失败:', error.message);
            return { banned: false };
        }
        
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
        
        // 检查是否限制指定功能
        var restrictions = ban.restrictions || {};
        if (feature && !restrictions[feature]) {
            return { banned: false };
        }
        
        return {
            banned: true,
            reason: ban.reason,
            expiresAt: ban.expires_at,
            restrictions: restrictions
        };
    } catch (e) {
        console.warn('[sync] ⚠️ 检查封禁状态异常:', e);
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
    
    var restrictedFeatures = [];
    if (banInfo.restrictions) {
        if (banInfo.restrictions.lottery) restrictedFeatures.push('抽奖');
        if (banInfo.restrictions.jixing) restrictedFeatures.push('纪行');
        if (banInfo.restrictions.bank) restrictedFeatures.push('银行');
        if (banInfo.restrictions.shop) restrictedFeatures.push('商店');
    }
    
    if (restrictedFeatures.length > 0) {
        message += '\n限制功能：' + restrictedFeatures.join('、');
    }
    
    alert(message);
    
    // 跳转到主页
    window.location.href = '../index.html';
}

// 页面封禁检查（在受限制页面调用）
async function checkPageBan(feature) {
    var banInfo = await checkUserBan(feature);
    if (banInfo.banned) {
        showBanMessage(banInfo);
        return true;
    }
    return false;
}
