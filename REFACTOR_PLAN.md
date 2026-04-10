# EchoForge 重构设计文档

## 一、项目重新定位

### 旧定位

> 一个 Node.js 原生的音频理解流水线，强调 agent-native（宿主 agent 调用多模态模型直接理解音频），EchoForge 本身不管理 API 凭证和 provider 选择。

### 新定位

> 一个 Python CLI 工具，负责任意音频文件的 AI 理解（以通义听悟为核心 provider）、结果结构化、以及 Obsidian 笔记渲染。
> 
> 它不造转写的轮子，而是把"下载 → 理解 → 渲染"三步串起来，成为个人音频知识库的入口。

### 核心目标

- 把 Feishu Minutes 音频下载下来（通过调用 `feishu_minutes_sync` CLI）
- 把音频交给通义听悟做转写 + 章节 + 摘要 + 待办
- 把结果渲染成 Obsidian Markdown 笔记
- 全程本地运行，不需要公网可访问的 OSS
- 轻量 CLI，可被 agent 调用，也可持续独立运行

---

## 二、技术选型

### 语言与运行时

- **Python 3.11+**
- **包管理**：`poetry`（推荐）或 `pyproject.toml + uv`
- 不使用 Node.js，完整迁移到 Python

### 核心依赖

| 能力 | 推荐方案 |
|---|---|
| HTTP 客户端 | `httpx` |
| CLI 框架 | `typer` |
| 数据校验 | `pydantic`（轻量使用） |
| Markdown 渲染 | `jinja2`（模板） |
| 文件上传到 Tingwu | `httpx` + `multipart/form-data` |
| 本地状态 | `json`（或极简 `sqlite3`） |
| 日志 | 标准库 `logging` |
| 配置 | `.env` + `pydantic-settings` |

### 不引入的重量级框架

- **不用 LangChain / LlamaIndex**：这个项目只做串行调用，不需要 RAG 框架
- **不用 FastAPI**：目前只需要 CLI，HTTP 服务不是目标
- **不用异步优先**：暂时用同步代码降低复杂度，除非实际需要并发

---

## 三、外部依赖

### feishu_minutes_sync

- 作为**外部 CLI 依赖**被调用
- EchoForge 通过 `subprocess.run(["feishu-minutes-sync", ...])` 或 `python -m feishu_minutes_sync` 调用
- 不直接 import，不共享状态
- 双方约定好数据交换格式：`exports/<minute_token>/minute.json`

### 通义听悟（Tingwu）

- 作为**核心 AI 理解 provider**
- 目前只接入这一家，后续如需多 provider 可扩展
- 不自己造转写/摘要能力

### Obsidian

- 作为**输出目标**
- EchoForge 只负责渲染 Markdown 文件到 Obsidian Vault 目录
- 不做 Obsidian 插件，只做文件生成

---

## 四、目录结构

建议重构后的目录结构：

```text
EchoForge/
├── pyproject.toml
├── README.md
├── .env.example
├── config/
│   └── settings.py          # pydantic-settings，统一配置入口
├── src/
│   └── echoforge/
│       ├── __init__.py
│       ├── cli.py           # typer CLI 入口
│       ├── errors.py       # 统一异常类
│       ├── log.py           # 日志配置
│       ├── models.py        # Pydantic 数据模型
│       ├── sources/
│       │   ├── __init__.py
│       │   └── feishu.py   # 调用 feishu_minutes_sync CLI
│       ├── providers/
│       │   ├── __init__.py
│       │   ├── tingwu.py    # 通义听悟 API 封装
│       │   └── base.py      # provider 基类（备选多 provider 扩展）
│       ├── pipeline/
│       │   ├── __init__.py
│       │   ├── orchestrator.py  # 主流程编排
│       │   ├── uploader.py      # 文件上传到 Tingwu
│       │   └── poller.py       # 任务状态轮询
│       ├── renderers/
│       │   ├── __init__.py
│       │   ├── obsidian.py  # Obsidian Markdown 渲染
│       │   └── templates/   # Jinja2 模板
│       └── storage/
│           ├── __init__.py
│           ├── state.py     # 本地状态管理（runs.json）
│           ├── artifacts.py # 产物路径管理
│           └── r2_client.py # Cloudflare R2 中转客户端
├── tests/
│   ├── conftest.py
│   ├── test_tingwu.py
│   ├── test_feishu_source.py
│   ├── test_orchestrator.py
│   └── test_renderer.py
└── outputs/                 # 本地运行时的默认输出目录
    └── obsidian/
```

**注意**：旧目录下的所有 Node.js 相关文件（`package.json`、`adapters/`、`pipeline/`、`schemas/`、`runtime/` 等）**全部删除或移入 `archive/`**。

---

## 五、CLI 命令设计

### 主入口

```bash
python -m echoforge --help
```

### 子命令

#### 1. `process-feishu`

从 Feishu Minutes token 开始，完整走完"下载 → 理解 → 渲染"全流程。

```bash
python -m echoforge process-feishu <minute_token>
python -m echoforge process-feishu <minute_token> --output-vault ~/Obsidian/vault
python -m echoforge process-feishu <minute_token> --skip-render  # 只处理到 Tingwu 出结果
python -m echoforge process-feishu <minute_token> --force  # 跳过状态检查重新处理
```

**内部调用链**：

```
feishu_minutes_sync fetch-minute <token>
    ↓
feishu_minutes_sync download-media <token>
    ↓
上传音频到 Cloudflare R2
    ↓
生成预签名 URL
    ↓
Tingwu CreateTask (FileUrl = 预签名URL)
    ↓
Tingwu GetTaskInfo (轮询)
    ↓
下载结果 JSON 到本地
    ↓
删除 R2 中的音频文件 ✓
    ↓
Obsidian 渲染
```

#### 2. `process-file`

直接处理本地音频文件，绕过 Feishu。

```bash
python -m echoforge process-file ./recording.ogg
python -m echoforge process-file ./recording.ogg --output-vault ~/Obsidian/vault
python -m echoforge process-file ./recording.ogg --title "自定义标题"
```

#### 3. `render`

仅渲染：用已有 Tingwu 结果生成 Obsidian 笔记（不重新处理）。

```bash
python -m echoforge render <run_id>
python -m echoforge render <run_id> --template brief  # 简洁模板
python -m echoforge render <run_id> --template full   # 完整模板
```

#### 4. `list-runs`

查看历史处理记录。

```bash
python -m echoforge list-runs
python -m echoforge list-runs --status pending
```

#### 5. `inspect-run`

查看某次运行的详细信息和产物路径。

```bash
python -m echoforge inspect-run <run_id>
```

---

## 六、通义听悟接入（Tingwu Provider）

### 6.1 使用哪套 API

**走 2023-09-30 的统一任务接口**：

- 创建任务：`PUT /openapi/tingwu/v2/tasks?type=offline`
- 查询状态：`GET /openapi/tingwu/v2/tasks/{task_id}`
- **文件 URL**：必须是一个公开可访问的 HTTP/HTTPS 地址（Tingwu 服务端下载），不支持本地文件直传

### 6.2 请求参数配置

第一版建议开启的能力：

```python
{
    "model": "腾龙",         # 听悟使用的基础模型
    "lang": "auto",          # 自动检测语言
    
    # 转写（必须）
    "transcription": True,
    
    # 章节（必须）
    "auto_chapters": True,
    
    # 摘要（必须）
    "summarization": {
        "enabled": True,
        "types": ["paragraph", "conversational", "questions_answering"]
    },
    
    # 会议辅助（必须）
    "meeting_assistance": {
        "enabled": True,
        "types": ["actions", "key_information"]
    },
    
    # 先不开
    "text_polish": False,
    "mind_map": False,
}
```

### 6.3 任务状态与轮询

- 提交任务后，立即开始轮询
- 轮询间隔：前 30 秒每 5 秒一次，之后每 15 秒一次
- 超时时间：默认 10 分钟
- 状态值：`pending` → `processing` → `completed` / `failed`
- 完成后，从 `result` 中提取各 JSON 文件的下载 URL

### 6.4 Tingwu 返回结果结构

Tingwu 完成任务后，`result` 字段包含：

```json
{
  "transcription": "https://...",
  "auto_chapters": "https://...",
  "summarization": "https://...",
  "meeting_assistance": "https://..."
}
```

EchoForge 下载这些 JSON 文件到本地，然后渲染。

### 6.5 Tingwu API 认证

- 使用阿里云账号的 AccessKey ID + AccessKey Secret
- 通过 STS Token 方式认证
- API 调用走：`https://tingwu.cn-beijing.aliyuncs.com`

### 6.6 音频中转方案：Cloudflare R2

Tingwu 不接受本地文件直传，必须提供一个 HTTP/HTTPS 可访问的文件 URL。
采用 **Cloudflare R2 作为临时中转站**，每次处理完立即删除文件，避免存储成本累积。

**完整音频流程**：

```
本地音频文件
    ↓
上传到 Cloudflare R2（私有 bucket）
    ↓
生成预签名 URL（3 小时有效）
    ↓
将 URL 作为 Tingwu FileUrl 提交任务
    ↓
轮询等待 Tingwu 处理完成
    ↓
拉取结果 JSON 到本地
    ↓
删除 R2 中的音频文件 ✓
    ↓
渲染 Obsidian 笔记
```

**为什么选 R2**：
- 存储免费（10GB/月起）
- Egress 免费（Tingwu 下载不产生流量费）
- 预签名 URL 可控制过期时间
- R2 与 Tingwu 之间走 Cloudflare 边缘网络，国内访问较稳定

**R2 bucket 命名建议**：`{project}-transit`（如 `echoforge-transit`）

**删除时机**：必须在 Tingwu 任务状态变为 `completed` 且**所有结果 JSON 均已下载到本地后**，才能删除 R2 文件。删除操作应记录在 `runs.json` 中，状态为 `media_cleaned: true`。

**注意**：R2 预签名 URL 的 `HEAD` 请求可能返回 403，但 `GET` 下载正常（Tingwu 使用的就是 GET），不影响实际使用。

---

## 七、Tingwu 结果 JSON 结构

以下为各能力的输出 JSON 结构（从 Tingwu 文档整理）：

### 7.1 Transcription（转写）

```json
{
  "TranscriptionUrl": "https://...",
  "Transcription": {
    "AudioDuration": 3600000,
    "Utterances": [
      {
        "Index": 1,
        "Content": "发言内容",
        "Start": 0,
        "End": 10000,
        "SpeakerId": "speaker_0"
      }
    ],
    "Language": "zh"
  }
}
```

### 7.2 AutoChapters（章节）

```json
{
  "AutoChapters": [
    {
      "ChapterTitle": "开场",
      "Summary": "介绍本次会议背景",
      "StartTime": 0,
      "EndTime": 300000
    }
  ]
}
```

### 7.3 Summarization（摘要）

```json
{
  "ParagraphSummary": "这是段落的完整摘要文本...",
  "ConversationalSummary": [
    {
      "SpeakerId": "speaker_0",
      "Summary": "该发言人说了什么"
    }
  ],
  "QaPairs": [
    {
      "Question": "问题内容",
      "Answer": "答案内容"
    }
  ]
}
```

### 7.4 MeetingAssistance（会议辅助）

```json
{
  "Actions": [
    {
      "SpeakerId": "speaker_1",
      "Action": "待办内容",
      "DueTime": "2026-03-25"
    }
  ],
  "KeyInformation": [
    {
      "Content": "重点内容",
      "Category": "关键决策"
    }
  ]
}
```

---

## 八、本地状态管理（runs.json）

### 设计原则

- 不引入数据库，用 JSON 文件存储状态
- 轻量化，只记录元信息和产物路径，不存放大文件
- 转写正文等大内容存在独立的 JSON 文件中，通过路径索引

### 状态文件结构

```json
{
  "runs": {
    "<run_id>": {
      "run_id": "run_20260323_143000",
      "source": "feishu",
      "minute_token": "obcxxxx",
      "title": "周会纪要",
      "status": "completed",
      "created_at": "2026-03-23T14:30:00+08:00",
      "completed_at": "2026-03-23T14:35:00+08:00",
      "tuning_task_id": "task_xxxxx",
      "tuning_status": "completed",
      "media_path": "/path/to/media.ogg",
      "outputs": {
        "transcription": "/path/to/results/transcription.json",
        "chapters": "/path/to/results/chapters.json",
        "summarization": "/path/to/results/summarization.json",
        "meeting_assistance": "/path/to/results/meeting_assistance.json"
      },
      "r2": {
        "object_key": "run_20260323_143000.ogg",
        "presigned_url": "https://...r2.cloudflarestorage.com/...",
        "media_cleaned": true,
        "cleaned_at": "2026-03-23T14:36:00+08:00"
      },
      "obsidian": {
        "note_path": "/Obsidian/vault/meetings/2026-03-23-周会纪要.md",
        "rendered_at": "2026-03-23T14:36:00+08:00"
      }
    }
  }
}
```

### 产物目录结构

每个 run 一个目录：

```
outputs/
└── runs/
    └── run_20260323_143000/
        ├── run.json              # 运行元信息（等同于 state.json 里的条目）
        ├── media.ogg             # 原始音频（软链或拷贝）
        └── results/
            ├── transcription.json
            ├── chapters.json
            ├── summarization.json
            └── meeting_assistance.json
```

---

## 九、Obsidian 渲染

### 9.1 渲染策略

- 使用 Jinja2 模板
- 输出 `.md` 文件
- 文件命名格式：`{date}-{title}.md`
- 输出路径：`{vault}/meetings/{date}-{title}.md`

### 9.2 模板设计（默认模板 full）

```markdown
# {title}

> **来源**：Feishu Minutes | *{created_at}*

---

## 章节速览

{# for chapter in chapters #}
- *[{chapter.start_time} - {chapter.end_time}]* {chapter.title}
  {chapter.summary}
{/ for #}

---

## 摘要

{paragraph_summary}

---

## 发言总结

{# for speaker in speakers #}
### {speaker.name}

{speaker.summary}
{/ for #}

---

## 问答

{# for qa in qa_pairs #}
**Q: {qa.question}**

{qa.answer}
{/ for #}

---

## 待办

{# for action in actions #}
- [ ] {action.content}
  - {action.speaker} {action.due_time}
{/ for #}

---

## 重点内容

{# for info in key_information #}
- [{info.category}] {info.content}
{/ for #}

---

*由 EchoForge 自动生成 | {generated_at}*
```

### 9.3 简洁模板（brief）

仅包含：章节 + 摘要 + 待办，适合快速回顾。

### 9.4 front-matter

笔记头部包含 YAML front-matter：

```yaml
---
uid: run_20260323_143000
source: feishu
minute_token: obcxxxx
created: 2026-03-23
tags:
  - meetings
  - feishu-minutes
---
```

---

## 十、配置设计

### 10.1 环境变量配置（.env）

```bash
# 通义听悟
TINGWU_ACCESS_KEY_ID=your_access_key_id
TINGWU_ACCESS_KEY_SECRET=your_access_key_secret
TINGWU_REGION=cn-beijing
TINGWU_MODEL=腾龙

# Cloudflare R2 中转存储
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=echoforge-transit
R2_PRESIGNED_EXPIRY=10800   # 预签名 URL 有效期（秒），不低于 10800）

# 本地路径
ECHFORGE_OUTPUTS_DIR=./outputs
OBSIDIAN_VAULT_PATH=/path/to/your/obsidian/vault
FEISHU_MINUTES_SYNC_BIN=/usr/local/bin/feishu-minutes-sync

# 行为配置
ECHFORGE_DEFAULT_TEMPLATE=full
ECHFORGE_POLL_INTERVAL_SECONDS=5
ECHFORGE_POLL_TIMEOUT_SECONDS=600

# 可选：代理（如果机器在国内访问 Tingwu 需要）
# HTTP_PROXY=http://127.0.0.1:7890
```

### 10.2 配置加载优先级

```
CLI 参数 > 环境变量 > .env 文件 > 默认值
```

---

## 十一、错误处理

### 11.1 错误分类

| 错误类型 | 说明 | 处理策略 |
|---|---|---|
| `FeishuNotFoundError` | minute token 不存在 | 直接报错退出 |
| `FeishuPermissionError` | 无权限访问该 minute | 记录警告，跳过 |
| `R2UploadError` | 音频上传到 R2 失败 | 重试 3 次，超时则报错 |
| `R2PresignError` | 预签名 URL 生成失败 | 重试 3 次 |
| `TingwuUploadError` | 音频上传失败 | 重试 3 次，超时则报错 |
| `TingwuTaskError` | Tingwu 任务失败 | 记录错误信息，继续下一个 |
| `R2CleanupError` | R2 文件删除失败 | 记录警告，不阻塞主流程；下次运行自动重试清理 |
| `ObsidianWriteError` | 笔记写入失败 | 记录警告，文件保留在 outputs |
| `ConfigMissingError` | 缺少必要配置 | 启动时报错，提示设置 |

### 11.2 重试策略

- R2 上传：最多 3 次，间隔 5 秒
- R2 预签名 URL 生成：最多 3 次，间隔 3 秒
- Tingwu 轮询：不重试，只判断超时
- Obsidian 写入：最多 2 次
- R2 文件删除：失败不阻塞，记录警告，下次运行清理

---

## 十二、模块职责定义

### 12.1 `sources/feishu.py`

**职责**：
- 调用 `feishu_minutes_sync` CLI 获取 minute 信息和音频文件
- 解析 `exports/<token>/minute.json` 获取结果路径
- 验证 CLI 是否可用

**对外接口**：

```python
class FeishuSource:
    def fetch(self, minute_token: str) -> FeishuMinuteResult:
        """调用 feishu_minutes_sync CLI，返回 minute 结果"""
        
    def download_media(self, minute_token: str, output_dir: Path) -> Path:
        """下载音频文件到本地目录"""
        
    def ensure_cli_available(self) -> bool:
        """检查 feishu_minutes_sync CLI 是否已安装"""
```

### 12.2 `providers/tingwu.py`

**职责**：
- 创建离线任务（接收公开 URL，由上层负责上传到 R2）
- 轮询任务状态
- 下载结果 JSON

**对外接口**：

```python
class TingwuProvider:
    def create_task(self, file_url: str) -> str:
        """提交任务（传入 Tingwu 可访问的 URL），返回 task_id"""
        
    def wait_for_completion(self, task_id: str) -> TingwuResult:
        """轮询直到完成或超时，返回结果"""
        
    def download_result(self, url: str, output_path: Path) -> None:
        """下载结果文件到本地"""
        
    def get_available_results(self, task_id: str) -> dict[str, str]:
        """获取各能力结果 URL 映射"""
```

### 12.3 `pipeline/orchestrator.py`

**职责**：
- 编排完整流程：`source -> R2上传 -> Tingwu提交 -> 轮询 -> 结果拉取 -> R2清理 -> renderer`
- 管理 run 生命周期
- 写状态文件
- **负责 R2 音频文件的生命周期**：在 Tingwu 任务完成后、Obsidian 笔记渲染前删除 R2 中的音频

**对外接口**：

```python
class Orchestrator:
    def run_feishu(self, minute_token: str, vault_path: Path) -> RunResult:
        """完整流程：下载 -> 上传R2 -> Tingwu提交 -> 轮询 -> 清理R2 -> 渲染"""
        
    def run_file(self, file_path: Path, vault_path: Path, title: str | None) -> RunResult:
        """直接处理本地文件（同样走 R2 中转）"""
        
    def render_only(self, run_id: str, template: str) -> Path:
        """仅渲染（跳过 Tingwu 处理）"""
```

### 12.4 `renderers/obsidian.py`

**职责**：
- 接收 Tingwu 结果 JSON
- 用 Jinja2 渲染 Markdown
- 写入 Obsidian vault

**对外接口**：

```python
class ObsidianRenderer:
    def render(self, run_id: str, template: str = "full") -> Path:
        """渲染笔记，返回写入的笔记路径"""
        
    def render_to(self, run_id: str, vault_path: Path, template: str) -> Path:
        """渲染到指定 vault"""
```

### 12.5 `storage/state.py`

**职责**：
- 读写 `runs.json` 状态文件
- 新增 run、更新状态
- 按 ID 查询

### 12.6 `storage/artifacts.py`

**职责**：
- 管理每个 run 的产物目录
- 提供产物路径解析

### 12.7 `storage/r2_client.py`

**职责**：
- 封装 Cloudflare R2 S3 兼容 API
- 提供上传、预签名 URL 生成、删除接口
- 与 `providers/tingwu.py` 配合，上层 orchestrator 调用

**对外接口**：

```python
class R2Client:
    def upload(self, file_path: Path, object_key: str | None = None) -> str:
        """上传文件，返回 R2 中的 object_key"""
        
    def generate_presigned_url(self, object_key: str, expiry: int | None = None) -> str:
        """生成预签名下载 URL"""
        
    def delete(self, object_key: str) -> bool:
        """删除指定对象"""
```

---

## 十三、删除清单

以下为旧版 EchoForge 中**应删除的文件/目录**：

```
EchoForge/
├── adapters/                     # 删除（source adapter 层已废弃）
├── pipeline/                     # 删除（Node.js pipeline 不再需要）
│   ├── stages/
│   ├── providers/
│   └── ...
├── schemas/                      # 删除（不再用复杂 schema）
├── runtime/                      # 删除（CLI 已完全重新设计）
├── skills/echoforge-chat-audio/  # 删除（agent-native 已废弃）
├── profiles/                      # 删除（profile 概念不再需要）
├── test/                          # 删除（测试文件全部重写）
├── scripts/validate-schemas.js     # 删除
├── package.json                   # 删除
├── node_modules/                  # 删除
├── state/recordings.json         # 备份后可删除
├── state/runs.json               # 备份后可删除
└── docs/                          # archive/ 保留旧文档
```

**保留**：
- `docs/audio-intelligence-design.md` → 移入 `archive/`
- `docs/repository-structure.md` → 移入 `archive/`
- `README.md` → **重写**

---

## 十四、实施阶段建议

### Phase 0：清场 + 搭架子

- 删除所有 Node.js 相关文件（除 archive）
- 创建 `pyproject.toml`，安装依赖
- 初始化 `src/echoforge/` 目录结构
- 写入最小 `config/settings.py`

### Phase 1：Tingwu Provider

- 实现 `providers/tingwu.py`
- 实现文件上传逻辑
- 实现轮询逻辑
- 用一个本地小音频文件手动测试完整链路

### Phase 2：Feishu Source

- 实现 `sources/feishu.py`
- 集成 `feishu_minutes_sync` CLI 调用
- 测试 Feishu token -> 下载 -> 提交 Tingwu

### Phase 3：Pipeline + State

- 实现 `pipeline/orchestrator.py`
- 实现 `storage/state.py`
- 实现 run 生命周期管理

### Phase 4：Obsidian Renderer

- 实现 `renderers/obsidian.py`
- 编写 Jinja2 模板
- 测试渲染输出

### Phase 5：CLI + 集成

- 完成 `cli.py` 所有命令
- 端到端测试完整流程
- 写 README

---

## 十五、验收标准

Phase 1 完成后，至少满足：

```bash
python -m echoforge process-file ./test.ogg
# 输出：outputs/runs/<run_id>/results/*.json
```

Phase 4 完成后，满足：

```bash
python -m echoforge process-feishu <token> --output-vault ~/Obsidian/vault
# 输出：Obsidian vault 中已生成 .md 笔记
```

最终验收：

- 全流程可无报错运行
- 生成的 Obsidian 笔记格式正确
- `list-runs` 能查看历史
- 配置通过环境变量加载
- 错误信息有意义，不崩溃

---

## 十六、命名约定

| 概念 | 命名 |
|---|---|
| 项目 | `echoforge` |
| 运行 ID | `run_{timestamp}_{random6}` |
| 产物目录 | `outputs/runs/{run_id}/` |
| 状态文件 | `outputs/runs.json` |
| Obsidian 目录 | `{vault}/meetings/` |
| 笔记文件名 | `{date}-{title}.md` |

---

## 十七、关键约束

1. **不引入 OSS**：全程本地文件流转
2. **不造转写轮子**：Tingwu 是唯一理解后端
3. **CLI 优先**：先做 CLI，HTTP 服务不考虑
4. **轻量状态**：只用 JSON，不上数据库
5. **feishu_minutes_sync 独立维护**：EchoForge 只调用它，不继承它的代码
