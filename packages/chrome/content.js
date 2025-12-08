// Content Script - 在网页中运行
// 注意：Manifest V3 的 content scripts 不支持 ES6 模块，所以需要内联解析器代码

// PageParser 核心功能（内联版本）
const PageParser = {
  // 解析文档内容
  parse(document, config) {
    const result = {};
    const selectors = config.selectors || {};

    for (const [key, selector] of Object.entries(selectors)) {
      try {
        result[key] = this.extractBySelector(document, selector);
      } catch (error) {
        console.error(`解析 ${key} 失败:`, error);
        result[key] = null;
      }
    }

    return result;
  },

  // 根据选择器提取内容
  extractBySelector(document, selector) {
    // 检查是否需要提取属性
    const attrMatch = selector.match(/^(.+)@(\w+)$/);
    let actualSelector = selector;
    let attrName = null;

    if (attrMatch) {
      actualSelector = attrMatch[1].trim();
      attrName = attrMatch[2];
    }

    // 查找元素
    const elements = document.querySelectorAll(actualSelector);

    if (elements.length === 0) {
      return null;
    }

    // 提取内容
    const values = Array.from(elements).map((element) => {
      if (attrName) {
        // 提取属性值
        return element.getAttribute(attrName) || "";
      } else {
        // 提取文本内容
        return this.extractText(element);
      }
    });

    // 如果只有一个结果，返回字符串；否则返回数组
    return values.length === 1 ? values[0] : values;
  },

  // 提取元素的文本内容
  extractText(element) {
    // 移除script和style标签
    const clone = element.cloneNode(true);
    const scripts = clone.querySelectorAll("script, style");
    scripts.forEach((script) => script.remove());

    // 获取文本并清理空白
    const text = clone.textContent || clone.innerText || "";
    return text.trim().replace(/\s+/g, " ");
  },

  // 获取指定域名的配置（通过 background script）
  async getConfig(domain) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "getConfig", domain },
        (response) => {
          resolve(response);
        }
      );
    });
  },
};

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "parse") {
    handleParse().then(sendResponse);
    return true; // 保持消息通道开启（异步）
  }

  if (request.action === "getPageInfo") {
    // 同步返回当前页面信息，供 popup 获取域名兜底使用
    sendResponse({
      url: window.location.href,
      domain: window.location.hostname,
      title: document.title,
    });
    // 无需返回 true（同步响应）
  }
});

// 处理解析请求
async function handleParse() {
  try {
    const currentDomain = window.location.hostname;
    const currentUrl = window.location.href;

    // 获取该域名的配置
    const config = await PageParser.getConfig(currentDomain);

    if (!config) {
      return {
        success: false,
        error: "未找到该网站的解析配置",
      };
    }

    // 执行解析
    const parsedData = PageParser.parse(document, config);

    // 添加元数据
    parsedData._meta = {
      url: currentUrl,
      domain: currentDomain,
      title: document.title,
      timestamp: new Date().toISOString(),
    };

    return {
      success: true,
      data: parsedData,
    };
  } catch (error) {
    console.error("解析错误:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}
