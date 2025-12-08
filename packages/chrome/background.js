// Service Worker - 后台脚本

// 安装时初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log("Page Parser 插件已安装");

  // 初始化存储
  chrome.storage.local.get(["configs"], (result) => {
    if (!result.configs) {
      // 设置默认配置（目前仅支持 www.bloomberg.com）
      const defaultConfigs = {
        "www.bloomberg.com": {
          name: "Bloomberg",
          selectors: {
            // 这些选择器需要根据实际网站结构调整
            title: "h1",
            content: "article, .article-body, .story-body",
            author: ".author, .byline",
            publishDate: "time, .timestamp",
          },
        },
      };

      chrome.storage.local.set({ configs: defaultConfigs });
    }
  });
});

// 监听来自content script或popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getConfig") {
    handleGetConfig(request.domain).then(sendResponse);
    return true;
  }

  if (request.action === "saveConfig") {
    handleSaveConfig(request.domain, request.config).then(sendResponse);
    return true;
  }

  if (request.action === "getAllConfigs") {
    handleGetAllConfigs().then(sendResponse);
    return true;
  }
});

// 获取特定域名的配置
async function handleGetConfig(domain) {
  return new Promise((resolve) => {
    chrome.storage.local.get(["configs"], (result) => {
      const configs = result.configs || {};
      resolve(configs[domain] || null);
    });
  });
}

// 保存配置
async function handleSaveConfig(domain, config) {
  return new Promise((resolve) => {
    chrome.storage.local.get(["configs"], (result) => {
      const configs = result.configs || {};
      configs[domain] = config;

      chrome.storage.local.set({ configs }, () => {
        resolve({ success: true });
      });
    });
  });
}

// 获取所有配置
async function handleGetAllConfigs() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["configs"], (result) => {
      resolve(result.configs || {});
    });
  });
}
