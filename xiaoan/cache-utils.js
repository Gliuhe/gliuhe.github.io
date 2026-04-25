/**
 * 缓存工具函数 - 简化缓存管理器的使用
 * 提供图片、音频、数据的快速缓存功能
 */

// 注册 Service Worker
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/xiaoan/sw.js');
            console.log('[CacheUtils] Service Worker 注册成功:', registration.scope);
            
            // 监听更新
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('[CacheUtils] 发现新版本，请刷新页面更新');
                    }
                });
            });
            
            return registration;
        } catch (e) {
            console.warn('[CacheUtils] Service Worker 注册失败:', e);
        }
    }
    return null;
}

// 预加载图片并显示加载进度
async function preloadImagesWithProgress(imageUrls, onProgress) {
    const results = [];
    const total = imageUrls.length;
    
    for (let i = 0; i < total; i++) {
        try {
            const url = imageUrls[i];
            const cached = await CacheManager.cacheImage(url);
            results.push({ url, success: true, data: cached });
            
            if (onProgress) {
                onProgress({
                    loaded: i + 1,
                    total: total,
                    percent: Math.round(((i + 1) / total) * 100),
                    current: url
                });
            }
        } catch (e) {
            results.push({ url, success: false, error: e.message });
        }
    }
    
    return results;
}

// 预加载音频
async function preloadAudioWithProgress(audioUrls, onProgress) {
    const results = [];
    const total = audioUrls.length;
    
    for (let i = 0; i < total; i++) {
        try {
            const url = audioUrls[i];
            const cached = await CacheManager.cacheAudio(url);
            results.push({ url, success: true, data: cached });
            
            if (onProgress) {
                onProgress({
                    loaded: i + 1,
                    total: total,
                    percent: Math.round(((i + 1) / total) * 100),
                    current: url
                });
            }
        } catch (e) {
            results.push({ url, success: false, error: e.message });
        }
    }
    
    return results;
}

// 创建带缓存的图片元素
async function createCachedImage(url, options = {}) {
    const img = document.createElement('img');
    
    try {
        // 尝试获取缓存的图片
        const cachedUrl = await CacheManager.cacheImage(url, options);
        img.src = cachedUrl;
    } catch (e) {
        // 缓存失败，使用原始URL
        img.src = url;
    }
    
    // 应用其他属性
    if (options.alt) img.alt = options.alt;
    if (options.className) img.className = options.className;
    if (options.id) img.id = options.id;
    
    return img;
}

// 创建带缓存的音频元素
async function createCachedAudio(url, options = {}) {
    const audio = document.createElement('audio');
    
    try {
        // 尝试获取缓存的音频
        const cachedUrl = await CacheManager.cacheAudio(url, options);
        audio.src = cachedUrl;
    } catch (e) {
        // 缓存失败，使用原始URL
        audio.src = url;
    }
    
    // 应用其他属性
    audio.preload = options.preload || 'auto';
    if (options.loop) audio.loop = true;
    if (options.autoplay) audio.autoplay = true;
    if (options.controls) audio.controls = true;
    if (options.className) audio.className = options.className;
    if (options.id) audio.id = options.id;
    
    return audio;
}

// 缓存页面所有图片
async function cacheAllImagesOnPage() {
    const images = document.querySelectorAll('img');
    const urls = [];
    
    images.forEach(img => {
        if (img.src && !img.src.startsWith('data:')) {
            urls.push(img.src);
        }
    });
    
    console.log(`[CacheUtils] 发现 ${urls.length} 张图片需要缓存`);
    return await CacheManager.preloadImages(urls);
}

// 缓存页面所有背景图片
async function cacheAllBackgroundImages() {
    const elements = document.querySelectorAll('*');
    const urls = [];
    
    elements.forEach(el => {
        const style = window.getComputedStyle(el);
        const bgImage = style.backgroundImage;
        
        if (bgImage && bgImage !== 'none') {
            const match = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
            if (match && match[1] && !match[1].startsWith('data:')) {
                urls.push(match[1]);
            }
        }
    });
    
    console.log(`[CacheUtils] 发现 ${urls.length} 张背景图片需要缓存`);
    return await CacheManager.preloadImages(urls);
}

// 显示缓存统计信息
async function showCacheStats() {
    try {
        const stats = await CacheManager.getStats();
        console.log('[CacheUtils] 缓存统计:', stats);
        
        // 创建显示面板
        const panel = document.createElement('div');
        panel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 15px;
            border-radius: 10px;
            font-family: monospace;
            font-size: 12px;
            z-index: 99999;
            max-width: 300px;
            max-height: 400px;
            overflow: auto;
        `;
        
        panel.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 10px;">📦 缓存统计</div>
            <div>总计: ${stats.total} 项</div>
            <div>图片: ${stats.images} 项</div>
            <div>音频: ${stats.audio} 项</div>
            <div>JSON: ${stats.json} 项</div>
            <div style="margin-top: 10px; border-top: 1px solid #666; padding-top: 10px;">
                <button onclick="clearAllCaches()" style="padding: 5px 10px; cursor: pointer;">清除所有缓存</button>
                <button onclick="this.parentElement.parentElement.remove()" style="padding: 5px 10px; cursor: pointer; margin-left: 5px;">关闭</button>
            </div>
        `;
        
        document.body.appendChild(panel);
        
        return stats;
    } catch (e) {
        console.error('[CacheUtils] 获取缓存统计失败:', e);
    }
}

// 清除所有缓存
async function clearAllCaches() {
    try {
        await CacheManager.clear();
        
        // 也清除 Service Worker 缓存
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
        }
        
        console.log('[CacheUtils] 所有缓存已清除');
        alert('✅ 所有缓存已清除');
        
        // 刷新页面
        location.reload();
    } catch (e) {
        console.error('[CacheUtils] 清除缓存失败:', e);
        alert('❌ 清除缓存失败: ' + e.message);
    }
}

// 智能缓存策略 - 根据网络状况自动选择
async function smartCache(url, options = {}) {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const saveData = connection?.saveData;
    const effectiveType = connection?.effectiveType;
    
    // 根据网络状况调整缓存策略
    if (saveData || effectiveType === '2g' || effectiveType === 'slow-2g') {
        // 省流量模式，优先使用缓存
        console.log('[CacheUtils] 省流量模式，优先使用缓存');
        options.maxAge = options.maxAge || 30 * 24 * 60 * 60 * 1000; // 30天
    } else if (effectiveType === '4g') {
        // 高速网络，可以更频繁更新
        options.maxAge = options.maxAge || 1 * 24 * 60 * 60 * 1000; // 1天
    }
    
    // 根据文件类型选择缓存方法
    if (url.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i)) {
        return await CacheManager.cacheImage(url, options);
    } else if (url.match(/\.(mp3|wav|ogg|m4a)$/i)) {
        return await CacheManager.cacheAudio(url, options);
    } else if (url.match(/\.json$/i) || options.type === 'json') {
        return await CacheManager.cacheJSON(url, options);
    }
    
    // 默认作为图片缓存
    return await CacheManager.cacheImage(url, options);
}

// 自动缓存页面资源
async function autoCachePageResources() {
    console.log('[CacheUtils] 开始自动缓存页面资源...');
    
    const results = {
        images: [],
        audio: [],
        errors: []
    };
    
    // 缓存页面图片
    try {
        results.images = await cacheAllImagesOnPage();
    } catch (e) {
        results.errors.push({ type: 'images', error: e.message });
    }
    
    // 缓存背景图片
    try {
        const bgResults = await cacheAllBackgroundImages();
        results.images = results.images.concat(bgResults);
    } catch (e) {
        results.errors.push({ type: 'backgrounds', error: e.message });
    }
    
    // 查找并缓存音频元素
    const audioElements = document.querySelectorAll('audio');
    for (const audio of audioElements) {
        if (audio.src) {
            try {
                const result = await CacheManager.cacheAudio(audio.src);
                results.audio.push({ url: audio.src, success: true, data: result });
            } catch (e) {
                results.audio.push({ url: audio.src, success: false, error: e.message });
            }
        }
    }
    
    console.log('[CacheUtils] 自动缓存完成:', results);
    return results;
}

// 页面加载完成后自动注册和缓存
document.addEventListener('DOMContentLoaded', async () => {
    // 注册 Service Worker
    await registerServiceWorker();
    
    // 延迟执行自动缓存（避免影响页面加载性能）
    setTimeout(() => {
        autoCachePageResources().catch(e => {
            console.warn('[CacheUtils] 自动缓存失败:', e);
        });
    }, 3000);
});

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        registerServiceWorker,
        preloadImagesWithProgress,
        preloadAudioWithProgress,
        createCachedImage,
        createCachedAudio,
        cacheAllImagesOnPage,
        cacheAllBackgroundImages,
        showCacheStats,
        clearAllCaches,
        smartCache,
        autoCachePageResources
    };
}
