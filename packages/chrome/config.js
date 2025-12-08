let allConfigs = {};
let currentDomain = null;
let isNewConfig = false;

// 初始化
document.addEventListener("DOMContentLoaded", () => {
  loadAllConfigs();
  bindEvents();
});

// 绑定事件
function bindEvents() {
  document
    .getElementById("add-new-btn")
    .addEventListener("click", handleAddNew);
  document
    .getElementById("add-selector-btn")
    .addEventListener("click", () => addSelectorField());
  document
    .getElementById("config-form")
    .addEventListener("submit", handleSubmit);
  document.getElementById("delete-btn").addEventListener("click", handleDelete);
  document.getElementById("cancel-btn").addEventListener("click", handleCancel);

  const exportSingleBtn = document.getElementById("export-single-btn");
  if (exportSingleBtn) {
    exportSingleBtn.addEventListener("click", handleExportSingleConfig);
  }

  const exportBtn = document.getElementById("export-configs-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", handleExportConfigs);
  }

  const importBtn = document.getElementById("import-configs-btn");
  if (importBtn) {
    importBtn.addEventListener("click", () => {
      const input = document.getElementById("import-file-input");
      if (input) {
        input.click();
      }
    });
  }

  const importInput = document.getElementById("import-file-input");
  if (importInput) {
    importInput.addEventListener("change", handleImportConfigs);
  }
}

// 加载所有配置
async function loadAllConfigs() {
  const response = await chrome.runtime.sendMessage({
    action: "getAllConfigs",
  });
  allConfigs = response || {};
  renderConfigList();
}

// 渲染配置列表
function renderConfigList() {
  const listElement = document.getElementById("config-list");
  const domains = Object.keys(allConfigs);

  if (domains.length === 0) {
    listElement.innerHTML =
      '<div style="padding: 20px; text-align: center; color: #999;">暂无配置</div>';
    return;
  }

  listElement.innerHTML = domains
    .map((domain) => {
      const config = allConfigs[domain];
      const selectorCount = Object.keys(config.selectors || {}).length;

      return `
      <div class="config-item" data-domain="${domain}">
        <div class="config-item-domain">${domain}</div>
        <div class="config-item-name">${config.name || "未命名"}</div>
        <div class="config-item-count">${selectorCount} 个选择器</div>
      </div>
    `;
    })
    .join("");

  // 绑定点击事件
  listElement.querySelectorAll(".config-item").forEach((item) => {
    item.addEventListener("click", () => {
      const domain = item.getAttribute("data-domain");
      loadConfig(domain);
    });
  });
}

// 加载配置到编辑器
function loadConfig(domain) {
  currentDomain = domain;
  isNewConfig = false;

  const config = allConfigs[domain];

  // 显示表单
  document.querySelector(".editor-placeholder").style.display = "none";
  document.getElementById("config-form").style.display = "flex";

  // 填充表单
  document.getElementById("domain-input").value = domain;
  document.getElementById("domain-input").disabled = true;
  document.getElementById("name-input").value = config.name || "";

  // 渲染选择器
  renderSelectors(config.selectors || {});

  // 高亮当前项
  document.querySelectorAll(".config-item").forEach((item) => {
    item.classList.remove("active");
    if (item.getAttribute("data-domain") === domain) {
      item.classList.add("active");
    }
  });

  // 显示删除按钮
  document.getElementById("delete-btn").style.display = "inline-block";
}

// 渲染选择器字段
function renderSelectors(selectors) {
  const container = document.getElementById("selectors-container");
  container.innerHTML = "";

  Object.entries(selectors).forEach(([key, value]) => {
    addSelectorField(key, value);
  });

  // 如果没有选择器，添加一个空的
  if (Object.keys(selectors).length === 0) {
    addSelectorField();
  }
}

// 添加选择器字段
function addSelectorField(key = "", value = "") {
  const container = document.getElementById("selectors-container");

  const selectorItem = document.createElement("div");
  selectorItem.className = "selector-item";
  selectorItem.innerHTML = `
    <input type="text" class="selector-key" placeholder="字段名" value="${key}">
    <input type="text" class="selector-value" placeholder="CSS选择器" value="${value}">
    <button type="button" class="remove-selector-btn">删除</button>
  `;

  // 绑定删除按钮
  selectorItem
    .querySelector(".remove-selector-btn")
    .addEventListener("click", () => {
      if (container.children.length > 1) {
        selectorItem.remove();
      } else {
        alert("至少保留一个选择器");
      }
    });

  container.appendChild(selectorItem);
}

// 处理添加新配置
function handleAddNew() {
  currentDomain = null;
  isNewConfig = true;

  // 显示表单
  document.querySelector(".editor-placeholder").style.display = "none";
  document.getElementById("config-form").style.display = "flex";

  // 清空表单
  document.getElementById("domain-input").value = "";
  document.getElementById("domain-input").disabled = false;
  document.getElementById("name-input").value = "";

  // 清空选择器
  document.getElementById("selectors-container").innerHTML = "";
  addSelectorField();

  // 取消高亮
  document.querySelectorAll(".config-item").forEach((item) => {
    item.classList.remove("active");
  });

  // 隐藏删除按钮
  document.getElementById("delete-btn").style.display = "none";
}

// 处理提交
async function handleSubmit(e) {
  e.preventDefault();

  const domain = document.getElementById("domain-input").value.trim();
  const name = document.getElementById("name-input").value.trim();

  if (!domain) {
    alert("请输入网站域名");
    return;
  }

  // 收集选择器
  const selectors = {};
  const selectorItems = document.querySelectorAll(".selector-item");

  selectorItems.forEach((item) => {
    const key = item.querySelector(".selector-key").value.trim();
    const value = item.querySelector(".selector-value").value.trim();

    if (key && value) {
      selectors[key] = value;
    }
  });

  if (Object.keys(selectors).length === 0) {
    alert("请至少添加一个有效的选择器");
    return;
  }

  // 构建配置对象
  const config = {
    name: name || domain,
    selectors: selectors,
  };

  // 保存配置
  await chrome.runtime.sendMessage({
    action: "saveConfig",
    domain: domain,
    config: config,
  });

  // 更新本地数据
  allConfigs[domain] = config;

  // 刷新列表
  renderConfigList();

  // 如果是新配置，加载它
  if (isNewConfig) {
    loadConfig(domain);
  }

  alert("配置保存成功！");
}

// 处理删除
async function handleDelete() {
  if (!currentDomain) return;

  if (!confirm(`确定要删除 ${currentDomain} 的配置吗？`)) {
    return;
  }

  // 删除配置
  delete allConfigs[currentDomain];

  // 保存到storage
  await chrome.runtime.sendMessage({
    action: "saveConfig",
    domain: currentDomain,
    config: null,
  });

  // 重新保存所有配置
  chrome.storage.local.set({ configs: allConfigs });

  // 刷新列表
  renderConfigList();

  // 隐藏表单
  handleCancel();

  alert("配置已删除");
}

// 处理取消
function handleCancel() {
  document.querySelector(".editor-placeholder").style.display = "flex";
  document.getElementById("config-form").style.display = "none";

  // 取消高亮
  document.querySelectorAll(".config-item").forEach((item) => {
    item.classList.remove("active");
  });

  currentDomain = null;
  isNewConfig = false;
}

// 导出所有配置为 JSON 文件
function handleExportConfigs() {
  if (!allConfigs || Object.keys(allConfigs).length === 0) {
    alert("当前没有可导出的配置");
    return;
  }

  const dataStr = JSON.stringify(allConfigs, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  a.href = url;
  a.download = `page-parser-configs-${yyyy}${mm}${dd}.json`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 从 JSON 文件导入配置（合并到现有配置中，仅在域名相同时覆盖）
function handleImportConfigs(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const parsed = JSON.parse(text);

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        alert("导入失败：JSON 根节点必须是对象（域名: 配置）");
        return;
      }

      // 简单结构校验
      Object.entries(parsed).forEach(([domain, cfg]) => {
        if (!cfg || typeof cfg !== "object") {
          throw new Error(`配置 ${domain} 不是对象`);
        }
        if (!cfg.selectors || typeof cfg.selectors !== "object") {
          throw new Error(`配置 ${domain} 缺少 selectors 字段`);
        }
      });

      // 合并到现有配置：只覆盖导入文件中出现的域名，其它域名保持不变
      Object.entries(parsed).forEach(([domain, cfg]) => {
        allConfigs[domain] = cfg;
      });

      chrome.storage.local.set({ configs: allConfigs }, () => {
        renderConfigList();
        handleCancel();
        alert("配置导入成功（已合并到现有配置，同名域名已覆盖）");
      });
    } catch (err) {
      console.error("导入配置失败", err);
      alert("导入失败：JSON 格式不正确或内容结构不符合要求");
    } finally {
      // 允许再次选择同一个文件时触发 change
      event.target.value = "";
    }
  };

  reader.readAsText(file, "utf-8");
}

// 导出当前选中的单个配置（导出结构与批量导出一致，仅包含一个域名）
function handleExportSingleConfig() {
  const domainInput = document.getElementById("domain-input");
  const domainFromInput = domainInput ? domainInput.value.trim() : "";
  const domain = currentDomain || domainFromInput;

  if (!domain) {
    alert("请先在右侧选择一个配置或输入域名");
    return;
  }

  const config = allConfigs[domain];
  if (!config) {
    alert("当前域名还没有已保存的配置，请先保存一次再导出");
    return;
  }

  // 导出结构保持为 { [domain]: config }，与批量导出根结构一致
  const dataToExport = { [domain]: config };
  const dataStr = JSON.stringify(dataToExport, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `page-parser-config-${domain}.json`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
