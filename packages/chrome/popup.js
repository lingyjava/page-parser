let currentUrl = "";
let currentDomain = "";
let parsedData = null;
let lastParseTime = 0;
let isParsing = false;

// 初始化
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // 获取当前标签页
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    // 检查是否是有效URL（排除 chrome:// 等特殊页面）
    if (
      !tab.url ||
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("edge://")
    ) {
      document.getElementById("current-url").textContent = "不支持此页面";
      document.getElementById("parser-status").textContent = "无法解析";
      document.getElementById("parser-status").style.color = "#dc3545";
      showStatus("当前页面不支持解析（可能是浏览器内部页面）", "error");
      disableButtons();
      return;
    }

    currentUrl = tab.url;

    // 先尝试从页面（content script）获取域名和 URL，保证和实际页面一致
    let pageInfo = null;
    try {
      pageInfo = await chrome.tabs.sendMessage(tab.id, {
        action: "getPageInfo",
      });
    } catch (e) {
      console.warn("从页面获取域名失败，使用 tab.url 兜底:", e);
    }

    if (pageInfo && pageInfo.domain) {
      currentDomain = pageInfo.domain;
      currentUrl = pageInfo.url || currentUrl;
    } else {
      // 安全地从 tab.url 提取域名
      try {
        currentDomain = new URL(currentUrl).hostname;
      } catch (error) {
        console.error("URL解析失败:", error);
        currentDomain = "未知域名";
        document.getElementById("current-url").textContent = currentDomain;
        document.getElementById("parser-status").textContent = "无法解析";
        document.getElementById("parser-status").style.color = "#dc3545";
        showStatus("无法解析当前页面URL", "error");
        disableButtons();
        return;
      }
    }

    document.getElementById("current-url").textContent = currentDomain;

    // 检查是否有配置的解析规则
    await checkParserConfig();

    // 绑定事件
    document
      .getElementById("reparse-btn")
      .addEventListener("click", parseCurrentPage);
    document.getElementById("send-btn").addEventListener("click", handleSend);
    document
      .getElementById("save-json-btn")
      .addEventListener("click", handleSaveJson);
    document
      .getElementById("config-btn")
      .addEventListener("click", handleConfig);

    // 自动解析预览
    parseCurrentPage();
  } catch (error) {
    console.error("初始化错误:", error);
    document.getElementById("current-url").textContent = "加载失败";
    showStatus("初始化失败: " + error.message, "error");
    disableButtons();
  }
});

// 检查解析器配置
async function checkParserConfig() {
  // 直接通过后台脚本获取配置，避免依赖外部模块
  const config = await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "getConfig", domain: currentDomain },
      (response) => {
        resolve(response);
      }
    );
  });
  const statusElement = document.getElementById("parser-status");

  if (config) {
    statusElement.textContent = "已配置";
    statusElement.style.color = "#28a745";
    enableButtons();
  } else {
    statusElement.textContent = "未配置";
    statusElement.style.color = "#dc3545";
    disableButtons();
  }
}

// 解析当前页面
async function parseCurrentPage() {
  const now = Date.now();

  // 如果正在解析中，直接提示
  if (isParsing) {
    showStatus("正在解析中，请稍候...", "info");
    return;
  }

  // 限制频率：3 秒内最多执行一次
  if (now - lastParseTime < 3000) {
    showStatus("操作过于频繁，请稍后再试", "error");
    return;
  }

  lastParseTime = now;
  isParsing = true;

  try {
    showStatus("正在解析页面...", "info");

    // 向content script发送解析请求
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    // 检查是否是有效URL
    if (
      !tab.url ||
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("edge://")
    ) {
      showStatus("当前页面不支持解析", "error");
      disableButtons();
      return;
    }

    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { action: "parse" });
    } catch (err) {
      // 如果发送消息失败，可能是 content script 没有注入
      // 尝试注入 content script
      if (
        err.message &&
        err.message.includes("Could not establish connection")
      ) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"],
          });
          // 等待一下让 content script 加载
          await new Promise((resolve) => setTimeout(resolve, 500));
          response = await chrome.tabs.sendMessage(tab.id, { action: "parse" });
        } catch (injectErr) {
          throw new Error("无法注入 content script，请刷新页面后重试");
        }
      } else {
        throw err;
      }
    }

    if (response && response.success) {
      parsedData = response.data;
      displayPreview(parsedData);
      showStatus("解析成功！", "success");
      enableButtons();
    } else {
      showStatus(response?.error || "解析失败", "error");
      disableButtons();
    }
  } catch (error) {
    console.error("解析错误:", error);
    showStatus("解析出错: " + error.message, "error");
    disableButtons();
  } finally {
    isParsing = false;
  }
}

// 发送到接口
async function handleSend() {
  if (!parsedData) {
    showStatus("没有可发送的数据", "error");
    return;
  }

  // 从存储中读取全局设置（发送接口地址），没有配置则使用默认值
  const settings = await new Promise((resolve) => {
    chrome.storage.local.get(["settings"], (result) => {
      resolve(result.settings || {});
    });
  });

  const apiEndpoint =
    settings.apiEndpoint || "http://localhost:8080/newshub/api/add";

  const sendBtn = document.getElementById("send-btn");
  const originalBtnHtml = sendBtn ? sendBtn.innerHTML : "";

  try {
    showStatus("正在发送数据...", "info");

    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = `<span class="btn-icon">⏳</span> 发送中...`;
    }

    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parsedData),
    });

    if (response.ok) {
      showStatus("发送成功！", "success");
    } else {
      let errorText = "";
      try {
        errorText = await response.text();
      } catch (e) {
        // ignore
      }
      const detail = errorText ? ` ${response.status} ${response.statusText} - ${errorText}` : ` ${response.status} ${response.statusText}`;
      showStatus("发送失败:" + detail, "error");
    }
  } catch (error) {
    console.error("发送错误:", error);
    showStatus("发送失败: " + error.message, "error");
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = originalBtnHtml;
    }
  }
}

// 保存为JSON
function handleSaveJson() {
  if (!parsedData) {
    showStatus("没有可保存的数据", "error");
    return;
  }

  try {
    const jsonStr = JSON.stringify(parsedData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentDomain}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus("保存成功！", "success");
  } catch (error) {
    console.error("保存错误:", error);
    showStatus("保存失败: " + error.message, "error");
  }
}

// 打开配置页面
function handleConfig() {
  chrome.tabs.create({ url: "config.html" });
}

// 显示预览
function displayPreview(data) {
  const previewElement = document.getElementById("preview-content");
  const jsonStr = JSON.stringify(data, null, 2);
  previewElement.innerHTML = `<pre>${escapeHtml(jsonStr)}</pre>`;
}

// 显示状态消息
function showStatus(message, type = "info") {
  const statusElement = document.getElementById("status-message");
  statusElement.textContent = message;
  statusElement.className = `status-message ${type}`;

  // if (type === "success") {
  //   setTimeout(() => {
  //     statusElement.textContent = "";
  //     statusElement.className = "status-message";
  //   }, 3000);
  // }
}

// 启用按钮
function enableButtons() {
  document.getElementById("reparse-btn").disabled = false;
  document.getElementById("send-btn").disabled = false;
  document.getElementById("save-json-btn").disabled = false;
}

// 禁用按钮
function disableButtons() {
  document.getElementById("reparse-btn").disabled = true;
  document.getElementById("send-btn").disabled = true;
  document.getElementById("save-json-btn").disabled = true;
}

// HTML转义
function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
