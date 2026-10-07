# KSU SSH Tunnel

<p align="center">
  <b>Universal SSH Tunnel Manager with Modern WebUI for KernelSU & APatch / Magisk</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/KernelSU-Supported-emerald.svg" alt="KernelSU" />
  <img src="https://img.shields.io/badge/WebUI-Built--in-blue.svg" alt="WebUI" />
  <img src="https://img.shields.io/badge/License-Apache_2.0-orange.svg" alt="License" />
</p>

---

## 📖 简介 / Introduction

**KSU SSH Tunnel** 是一款专为 Android (KernelSU / APatch / Magisk) 打造的通用型 SSH 端口转发与隧道管理模块。

本模块内置了高颜值的 **KernelSU WebUI** 嵌入式管理面板，能够在手机上可视化配置、启停、监控和调试多条 SSH 隧道；同时具备高健壮性（Robustness）的主管守护进程，支持断网重连、指数退避策略、进程自动保活与心跳检测，可无缝配合 Tailscale、本地局域网以及公网 VPS 实现移动端与外部环境的内网穿透。

---

## ✨ 核心特性 / Features

1. **三种隧道转发模式全支持**
   - 🔹 **本地端口转发 (Local Port Forwarding, `-L`)**：将远程内网服务（如 DSH、Jupyter、Web 管理后台）安全映射至手机本地回环 `127.0.0.1` 访问。
   - 🔹 **远端反向转发 (Remote Reverse Forwarding, `-R`)**：将手机本地服务反向暴露给远程服务器。
   - 🔹 **动态 SOCKS5 代理 (Dynamic Forwarding, `-D`)**：一键在手机本地开启 SOCKS5 代理端口，将手机流量安全路由通过远程 SSH 跳板。

2. **现代化 KernelSU WebUI 管理面板**
   - 🎨 **移动优先响应式设计**：完美适配手机端屏幕，支持深色模式 (Dark) 与浅色模式 (Light) 自由切换。
   - 📊 **可视化连接流拓扑**：直观展示 `Local: Port` ➔ `SSH Gateway` ➔ `Target: Port` 连接路径与实时状态（脉冲呼吸灯）。
   - ⚡ **毫秒级握手延迟测试**：内置 SSH 连通性探测功能，一键测算服务器往返延迟。
   - 📜 **实时日志监控抽屉**：支持各隧道独立日志 2s 轮询实时滚屏、截取与清空。
   - 🛠 **离线自包含（Zero-CDN）**：单文件自给自足，内嵌 SVG 图标与 CSS/JS，无任何外网依赖，纯内网/离线环境下顺畅打开。

3. **高健壮性守护进程架构 (High Robustness)**
   - **独立 Worker 进程模型**：每个隧道采用独立子进程监控，单隧道故障不影响其他隧道。
   - **智能指数退避策略**：断网或网络波动时以 2s ~ 60s 渐进式延迟重试，避免忙轮询耗尽手机电量；连接恢复 30s 后自动重置退避计时器。
   - **前置网络可达性探测**：在发起 SSH 握手前探测目标网络连通性。
   - **优雅信号捕获与清理**：全面捕获 `SIGTERM`/`SIGINT`，杜绝孤儿 SSH 僵尸进程。

4. **KernelSU Manager 深度集成**
   - **Action 快捷按钮**：支持在 KernelSU Manager 中点击模块 Action 按钮一键全开/全关，并通过 `ksud toast` 弹出浮窗状态提示。
   - **动态状态同步**：模块描述字段与实时运行状态精准联动（如 `[✅ 1/1 Running]` / `[❌ Stopped]`）。
   - **开机自启动**：`late_start` 阶段异步等待网络就绪后平滑拉起隧道服务。

---

## 📦 依赖条件 / Prerequisites

- 已 Root 设备，支持 **KernelSU** (>= 0.6.6) 或 **APatch** / **Magisk**。
- 依赖基础 SSH 客户端模块：**[SSH for Magisk](https://github.com/powerAn2020/Patched-MagiskSSH)**（提供 OpenSSH 运行环境）。
- 手机端 root 用户已配置访问远程服务器的私钥（默认识别 `/data/adb/ssh/root/.ssh/id_ed25519`）。

---

## 🚀 安装方式 / Installation

1. 下载 Releases 中的刷机包 `ksu-ssh-tunnel-v1.0.0.zip`。
2. 打开 **KernelSU Manager** ➔ 进入「模块」➔ 选择「安装」➔ 刷入下载的 zip 包。
3. 安装完成后，模块默认自动就绪；在模块卡片上点击 **Web UI** 即可进入可视化管理页面。

---

## ⚙️ 配置文件说明 (`tunnels.json`)

模块配置文件位于 `/data/adb/modules/ksu-ssh-tunnel/tunnels.json`，支持在 WebUI 中直接修改，也可手动编辑：

```json
{
  "settings": {
    "autostart": true,
    "default_identity": "/data/adb/ssh/root/.ssh/id_ed25519",
    "keepalive_interval": 15,
    "keepalive_count_max": 3
  },
  "tunnels": [
    {
      "id": "dsh-web",
      "name": "DSH Web Service",
      "enabled": true,
      "type": "local",
      "remote_host": "100.92.178.83",
      "remote_port": 22,
      "remote_user": "csy",
      "identity_file": "/data/adb/ssh/root/.ssh/id_ed25519",
      "local_host": "127.0.0.1",
      "local_port": 3080,
      "target_host": "127.0.0.1",
      "target_port": 3080,
      "extra_args": ""
    }
  ]
}
```

---

## 🛠 WebUI 预览与调试

`webroot/index.html` 内置了完整的模拟器状态机（Mock Mode）。若直接在 PC 浏览器中双击打开 `webroot/index.html`，无需 KernelSU 环境即可体验完整的交互设计、添加/编辑隧道以及切换明暗主题。

---

## 📄 License

Licensed under the [Apache License, Version 2.0](LICENSE).  
Copyright (c) 2026 WinterSold1er.
