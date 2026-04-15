var CLOUD_SYNC_KEYS=['voucher','lottery','premium','bankTicket','jixing_muchun_currency'];
var BANK_ACC_MAP={bankSavings:'savings',savingsBalance:'savings',bankDeposit:'deposit',depositBalance:'deposit',bankInvestment:'investment',investmentBalance:'investment'};
var USER_ID='d71f9173-bd5d-4d30-a033-0429ae162fd7';
function _getSb(){
    if(typeof window.supabase==='undefined')return null;
    return window.supabase.createClient('https://qhnudlhpwmdzdxufcqjc.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFobnVkbGhwd21kemR4dWZjcWpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYzNzgzNSwiZXhwIjoyMDkxMjEzODM1fQ.WuH9mFVKKKQGFwjHBFO4NQhs6mL0oVRVlAlzGR5GYqc');
}
function syncCurrencyToCloud(key){
    try{
        var sb=_getSb();if(!sb)return;
        var val=parseInt(localStorage.getItem(key))||0;
        if(['voucher','lottery','premium','bankTicket'].indexOf(key)>=0){
            sb.from('user_currencies').upsert({user_id:USER_ID,currency_type:key,amount:val},{onConflict:'user_id,currency_type'}).then(function(r){if(r.error)console.warn('[sync] ⚠️ 货币同步失败:',key,r.error.message)});
        }else if(key==='jixing_muchun_currency'){
            sb.from('jisuan_data').upsert({id:'global',jixing_muchun_currency:val},{onConflict:'id'}).then(function(r){if(r.error)console.warn('[sync] ⚠️ 纪行券同步失败:',r.error.message)});
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
