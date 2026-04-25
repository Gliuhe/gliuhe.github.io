/**
 * 通用缓存管理器 - 支持图片、音乐、JSON数据等资源的缓存
 * 使用 IndexedDB 存储大文件，localStorage 存储元数据
 */

const CacheManager = {
    DB_NAME: 'XiaoAnCache',
    DB_VERSION: 1,
    STORE_NAME: 'resources',
    META_PREFIX: 'cache_meta_',
    
    db: null,
    
    // 初始化 IndexedDB
    async init() {
        if (this.db) return this.db;
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'key' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('type', 'type', { unique: false });
                }
            };
        });
    },
    
    // 生成缓存键
    _makeKey(url, type = 'auto') {
        const cleanUrl = url.split('?')[0]; // 移除查询参数
        const hash = btoa(cleanUrl).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
        return `${type}_${hash}`;
    },
    
    // 获取元数据
    _getMeta(key) {
        try {
            const data = localStorage.getItem(this.META_PREFIX + key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    },
    
    // 设置元数据
    _setMeta(key, meta) {
        try {
            localStorage.setItem(this.META_PREFIX + key, JSON.stringify(meta));
        } catch (e) {
            console.warn('[CacheManager] 无法保存元数据:', e);
        }
    },
    
    // 删除元数据
    _removeMeta(key) {
        localStorage.removeItem(this.META_PREFIX + key);
    },
    
    // 缓存图片
    async cacheImage(url, options = {}) {
        const key = this._makeKey(url, 'image');
        const maxAge = options.maxAge || 7 * 24 * 60 * 60 * 1000; // 默认7天
        
        // 检查现有缓存
        const cached = await this.get(key);
        if (cached) {
            const meta = this._getMeta(key);
            if (meta && Date.now() - meta.timestamp < maxAge) {
                console.log('[CacheManager] 使用缓存的图片:', url);
                return cached.data;
            }
        }
        
        try {
            // 获取图片
            const response = await fetch(url, { 
                mode: 'cors',
                cache: 'force-cache'
            });
            
            if (!response.ok) throw new Error('Fetch failed');
            
            const blob = await response.blob();
            const dataUrl = await this._blobToDataUrl(blob);
            
            // 保存到缓存
            await this.set(key, {
                data: dataUrl,
                type: 'image',
                url: url,
                timestamp: Date.now()
            });
            
            this._setMeta(key, {
                url: url,
                timestamp: Date.now(),
                size: blob.size,
                type: blob.type
            });
            
            console.log('[CacheManager] 图片已缓存:', url);
            return dataUrl;
        } catch (e) {
            console.warn('[CacheManager] 缓存图片失败:', url, e);
            // 返回原始URL作为后备
            return url;
        }
    },
    
    // 缓存音乐/音频
    async cacheAudio(url, options = {}) {
        const key = this._makeKey(url, 'audio');
        const maxAge = options.maxAge || 30 * 24 * 60 * 60 * 1000; // 默认30天
        
        // 检查现有缓存
        const cached = await this.get(key);
        if (cached) {
            const meta = this._getMeta(key);
            if (meta && Date.now() - meta.timestamp < maxAge) {
                console.log('[CacheManager] 使用缓存的音频:', url);
                return cached.data;
            }
        }
        
        try {
            // 获取音频文件
            const response = await fetch(url, { 
                mode: 'cors',
                cache: 'force-cache'
            });
            
            if (!response.ok) throw new Error('Fetch failed');
            
            const blob = await response.blob();
            const dataUrl = await this._blobToDataUrl(blob);
            
            // 保存到缓存
            await this.set(key, {
                data: dataUrl,
                type: 'audio',
                url: url,
                timestamp: Date.now()
            });
            
            this._setMeta(key, {
                url: url,
                timestamp: Date.now(),
                size: blob.size,
                type: blob.type
            });
            
            console.log('[CacheManager] 音频已缓存:', url);
            return dataUrl;
        } catch (e) {
            console.warn('[CacheManager] 缓存音频失败:', url, e);
            return url;
        }
    },
    
    // 缓存JSON数据
    async cacheJSON(url, options = {}) {
        const key = this._makeKey(url, 'json');
        const maxAge = options.maxAge || 60 * 60 * 1000; // 默认1小时
        
        // 检查现有缓存
        const cached = await this.get(key);
        if (cached && !options.force) {
            const meta = this._getMeta(key);
            if (meta && Date.now() - meta.timestamp < maxAge) {
                console.log('[CacheManager] 使用缓存的JSON:', url);
                return cached.data;
            }
        }
        
        try {
            const response = await fetch(url, {
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });
            
            if (!response.ok) throw new Error('Fetch failed');
            
            const data = await response.json();
            
            // 保存到缓存
            await this.set(key, {
                data: data,
                type: 'json',
                url: url,
                timestamp: Date.now()
            });
            
            this._setMeta(key, {
                url: url,
                timestamp: Date.now()
            });
            
            console.log('[CacheManager] JSON已缓存:', url);
            return data;
        } catch (e) {
            console.warn('[CacheManager] 缓存JSON失败:', url, e);
            // 尝试返回过期缓存
            if (cached) {
                console.log('[CacheManager] 使用过期的JSON缓存:', url);
                return cached.data;
            }
            throw e;
        }
    },
    
    // 保存数据到 IndexedDB
    async set(key, value) {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            
            const item = {
                key: key,
                ...value
            };
            
            const request = store.put(item);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },
    
    // 从 IndexedDB 获取数据
    async get(key) {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.get(key);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    // 删除缓存
    async remove(key) {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.delete(key);
            
            request.onsuccess = () => {
                this._removeMeta(key);
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    },
    
    // 清空所有缓存
    async clear() {
        await this.init();
        
        // 清除 IndexedDB
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.clear();
            
            request.onsuccess = () => {
                // 清除 localStorage 中的元数据
                const keys = Object.keys(localStorage);
                keys.forEach(key => {
                    if (key.startsWith(this.META_PREFIX)) {
                        localStorage.removeItem(key);
                    }
                });
                console.log('[CacheManager] 所有缓存已清除');
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    },
    
    // 获取缓存统计
    async getStats() {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.getAll();
            
            request.onsuccess = () => {
                const items = request.result;
                const stats = {
                    total: items.length,
                    images: items.filter(i => i.type === 'image').length,
                    audio: items.filter(i => i.type === 'audio').length,
                    json: items.filter(i => i.type === 'json').length,
                    items: items.map(i => ({
                        key: i.key,
                        type: i.type,
                        url: i.url,
                        timestamp: i.timestamp
                    }))
                };
                resolve(stats);
            };
            request.onerror = () => reject(request.error);
        });
    },
    
    // Blob 转 DataURL
    _blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },
    
    // 预加载图片列表
    async preloadImages(urls, options = {}) {
        const results = [];
        for (const url of urls) {
            try {
                const data = await this.cacheImage(url, options);
                results.push({ url, success: true, data });
            } catch (e) {
                results.push({ url, success: false, error: e.message });
            }
        }
        return results;
    },
    
    // 预加载音频列表
    async preloadAudio(urls, options = {}) {
        const results = [];
        for (const url of urls) {
            try {
                const data = await this.cacheAudio(url, options);
                results.push({ url, success: true, data });
            } catch (e) {
                results.push({ url, success: false, error: e.message });
            }
        }
        return results;
    }
};

// 自动初始化
CacheManager.init().catch(e => console.warn('[CacheManager] 初始化失败:', e));

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CacheManager;
}
