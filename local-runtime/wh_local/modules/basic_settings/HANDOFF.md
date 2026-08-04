# 系统配置后端交接文档

## 1. 模块范围

系统配置属于本地运行时的基础设置模块，代码位置：

```text
local-runtime/wh_local/modules/basic_settings/
```

当前只包含后端能力，不包含前端页面。

主要负责：

- 文本 AI 配置
- 图生图配置
- 备用图生图配置
- 腾讯云 COS 配置
- 文本/图片任务运行限制
- 配置发布摘要
- 密钥保存状态管理

## 2. 代码文件说明

```text
local-runtime/wh_local/app/main.py
```

FastAPI 应用入口，负责初始化数据库并挂载系统配置路由。

```text
local-runtime/wh_local/modules/basic_settings/router.py
```

接口层，定义系统配置相关 HTTP API。

```text
local-runtime/wh_local/modules/basic_settings/schemas.py
```

字段模型和参数校验，前端提交的数据结构以这里为准。

```text
local-runtime/wh_local/modules/basic_settings/service.py
```

业务逻辑层，负责读取默认配置、保存配置、保存密钥、生成配置摘要。

```text
local-runtime/wh_local/db.py
```

SQLite 初始化和事务封装。当前系统配置使用 `workbench_settings`、`secret_values`、`action_logs` 三张表。

```text
local-runtime/wh_local/session.py
```

临时鉴权逻辑。当前使用开发 token，后续需要对接正式登录模块。

## 3. 接口总览

当前系统配置后端一共有 3 个接口。

| 方法 | 路径 | 说明 | 是否需要 token |
| --- | --- | --- | --- |
| GET | `/desktop/basic-settings/system-config` | 获取系统配置 | 是 |
| PUT | `/desktop/basic-settings/system-config` | 保存系统配置 | 是 |
| POST | `/desktop/basic-settings/system-config/publish` | 生成配置发布摘要 | 是 |

当前请求头：

```http
Authorization: Bearer dev-admin-token
```

注意：`dev-admin-token` 只是开发阶段临时 token，正式联调时应替换为登录模块返回的本地 token。

## 4. 获取系统配置

### 请求

```http
GET /desktop/basic-settings/system-config
Authorization: Bearer dev-admin-token
```

### 返回示例

```json
{
  "ok": true,
  "ai": {
    "base_url": "https://api.aicoming.top/v1",
    "model": "gpt-5.4-mini"
  },
  "image": {
    "base_url": "https://api.aicoming.top/v1",
    "model": "gpt-image-2",
    "reference_model": "gpt-image-2-1k"
  },
  "backup_image": {
    "base_url": "",
    "model": "",
    "reference_model": ""
  },
  "cos": {
    "bucket": "",
    "region": "ap-guangzhou"
  },
  "limits": {
    "text_workers": 30,
    "image_workers": 15,
    "text_request_limit": 30,
    "image_request_limit": 15,
    "image_retry_attempts": 3,
    "image_provider_strategy": "balanced",
    "provider_backup_share_percent": 0,
    "image_stop_after_billable_failure": true
  },
  "updates": {
    "cos_prefix": "temu-y2-control",
    "public_base_url": ""
  },
  "secrets": {
    "ai": {
      "api_key_configured": false
    },
    "image": {
      "api_key_configured": false
    },
    "backup_image": {
      "api_key_configured": false
    },
    "cos": {
      "secret_id_configured": false,
      "secret_key_configured": false
    }
  },
  "summary": {
    "ai_configured": false,
    "image_configured": false,
    "backup_image_configured": false,
    "cos_configured": false,
    "text_workers": 30,
    "image_workers": 15,
    "cos_region": "ap-guangzhou",
    "update_public_base_url_configured": false
  }
}
```

### 前端使用说明

- 页面初始化时调用该接口。
- `ai`、`image`、`backup_image`、`cos`、`limits`、`updates` 用来回填表单。
- `secrets` 用来显示密钥是否已配置。
- `summary` 用来显示配置完成度或顶部状态。
- 接口不会返回任何密钥明文。

## 5. 保存系统配置

### 请求

```http
PUT /desktop/basic-settings/system-config
Authorization: Bearer dev-admin-token
Content-Type: application/json
```

### 请求体完整结构

```json
{
  "ai": {
    "base_url": "https://api.aicoming.top/v1",
    "model": "gpt-5.4-mini",
    "api_key": "",
    "clear_api_key": false
  },
  "image": {
    "base_url": "https://api.aicoming.top/v1",
    "model": "gpt-image-2",
    "reference_model": "gpt-image-2-1k",
    "api_key": "",
    "clear_api_key": false
  },
  "backup_image": {
    "base_url": "",
    "model": "",
    "reference_model": "",
    "api_key": "",
    "clear_api_key": false
  },
  "cos": {
    "bucket": "",
    "region": "ap-guangzhou",
    "secret_id": "",
    "secret_key": "",
    "clear_secret_id": false,
    "clear_secret_key": false
  },
  "limits": {
    "text_workers": 30,
    "image_workers": 15,
    "text_request_limit": 30,
    "image_request_limit": 15,
    "image_retry_attempts": 3,
    "image_provider_strategy": "balanced",
    "provider_backup_share_percent": 0,
    "image_stop_after_billable_failure": true
  },
  "updates": {
    "cos_prefix": "temu-y2-control",
    "public_base_url": ""
  }
}
```

### 返回

保存成功后返回结构与 GET 基本一致，并额外返回：

```json
{
  "message": "系统配置已保存"
}
```

## 6. 字段清单

保存接口请求体共有 6 组字段，合计 30 个字段。

### ai：文本 AI，4 个字段

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `base_url` | string | `https://api.aicoming.top/v1` | 文本 AI 接口地址 |
| `model` | string | `gpt-5.4-mini` | 文本 AI 主模型 |
| `api_key` | string/null | `null` | 文本 AI API Key |
| `clear_api_key` | boolean | `false` | 是否清空文本 AI API Key |

### image：主图生图，5 个字段

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `base_url` | string | `https://api.aicoming.top/v1` | 图生图接口地址 |
| `model` | string | `gpt-image-2` | 主图生图模型 |
| `reference_model` | string | `gpt-image-2-1k` | 主图生图参考模型 |
| `api_key` | string/null | `null` | 主图生图 API Key |
| `clear_api_key` | boolean | `false` | 是否清空主图生图 API Key |

### backup_image：备用图生图，5 个字段

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `base_url` | string | 空字符串 | 备用图生图接口地址 |
| `model` | string | 空字符串 | 备用图生图模型 |
| `reference_model` | string | 空字符串 | 备用图生图参考模型 |
| `api_key` | string/null | `null` | 备用图生图 API Key |
| `clear_api_key` | boolean | `false` | 是否清空备用图生图 API Key |

### cos：对象存储，6 个字段

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `bucket` | string | 空字符串 | 腾讯云 COS bucket |
| `region` | string | `ap-guangzhou` | 腾讯云 COS region |
| `secret_id` | string/null | `null` | 腾讯云 SecretId |
| `secret_key` | string/null | `null` | 腾讯云 SecretKey |
| `clear_secret_id` | boolean | `false` | 是否清空 SecretId |
| `clear_secret_key` | boolean | `false` | 是否清空 SecretKey |

### limits：运行限制，8 个字段

| 字段 | 类型 | 默认值 | 校验范围 | 说明 |
| --- | --- | --- | --- | --- |
| `text_workers` | integer | `30` | 1-60 | 文本任务并发数 |
| `image_workers` | integer | `15` | 1-100 | 图片任务并发数 |
| `text_request_limit` | integer | `30` | 1-100 | 文本请求限流 |
| `image_request_limit` | integer | `15` | 1-100 | 图片请求限流 |
| `image_retry_attempts` | integer | `3` | 1-5 | 图片失败重试次数 |
| `image_provider_strategy` | string | `balanced` | 枚举值 | 图片服务商策略 |
| `provider_backup_share_percent` | integer | `0` | 0-90 | 备用服务商分流比例 |
| `image_stop_after_billable_failure` | boolean | `true` | true/false | 计费失败后是否停止图片任务 |

`image_provider_strategy` 可选值：

```text
balanced
primary_first
backup_first
cost_first
```

### updates：更新配置，2 个字段

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `cos_prefix` | string | `temu-y2-control` | COS 配置发布前缀 |
| `public_base_url` | string | 空字符串 | 公开访问基础地址 |

## 7. 密钥处理规则

密钥字段包括：

```text
ai.api_key
image.api_key
backup_image.api_key
cos.secret_id
cos.secret_key
```

规则：

- GET 接口不返回密钥明文。
- GET 接口只返回 `secrets.xxx_configured` 状态。
- PUT 时密钥传空字符串或 `null`，表示不修改旧密钥。
- PUT 时传入新密钥字符串，表示覆盖保存。
- PUT 时对应的 `clear_*` 为 `true`，表示删除旧密钥。

前端输入框建议：

- 密钥输入框 placeholder 使用 `留空不修改`。
- 已配置时显示 `已配置`，未配置时显示 `未配置`。
- 清空密钥建议做成单独按钮或开关，不要让用户清空输入框就直接删除密钥。

## 8. 发布配置摘要

### 请求

```http
POST /desktop/basic-settings/system-config/publish
Authorization: Bearer dev-admin-token
```

### 返回示例

```json
{
  "ok": true,
  "manifest": {
    "version": "system-config-20260804_102030",
    "created_at": "2026-08-04T02:20:30+00:00",
    "config_name": "system_config.json",
    "config_sha256": "hash-value",
    "summary": {
      "ai_configured": false,
      "image_configured": false,
      "backup_image_configured": false,
      "cos_configured": false,
      "text_workers": 30,
      "image_workers": 15,
      "cos_region": "ap-guangzhou",
      "update_public_base_url_configured": false
    },
    "required_restart": true
  }
}
```

说明：

- 当前接口只生成发布摘要。
- 不会自动上传 COS。
- 不会自动修改线上配置。
- 不包含密钥明文。

## 9. 错误码

| 状态码 | 场景 |
| --- | --- |
| 401 | 没有传 Bearer token，或 token 不正确 |
| 403 | 当前用户不是管理员 |
| 422 | 请求字段类型错误，或运行限制超出范围 |
| 503 | 保存密钥时缺少加密依赖 `cryptography` |

## 10. 本地启动命令

```powershell
cd D:\syq\MainPG\local-runtime
D:\ecommerce-automation-workbench\.venv\Scripts\python.exe -X utf8 -m uvicorn wh_local.app:app --host 127.0.0.1 --port 8010
```

健康检查：

```text
http://127.0.0.1:8010/health
```

接口测试：

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8010/desktop/basic-settings/system-config" -Headers @{ Authorization = "Bearer dev-admin-token" }
```

## 11. 前端对接建议

页面建议分区：

```text
文本 AI
图生图
备用图生图
COS 与运行限制
更新发布
```

控件建议：

- `image_provider_strategy` 使用下拉框。
- `image_stop_after_billable_failure` 使用开关。
- 并发数、限流、重试次数使用数字输入框。
- 密钥字段使用密码输入框。
- 密钥清空使用独立按钮或确认开关。
- 保存前可以在前端做范围校验，但以后端校验为最终准。

页面流程：

1. 页面加载时调用 GET 接口。
2. 用返回的公开配置回填表单。
3. 用 `secrets` 显示密钥配置状态。
4. 用户点击保存时调用 PUT 接口。
5. 用户点击发布或生成摘要时调用 POST publish 接口。

## 12. 后续待补

- 对接正式登录模块，替换当前 `dev-admin-token`。
- 增加后端内部读取密钥的方法，供 AI/COS 运行任务使用。
- 增加 `.gitignore`，排除 `outputs/`、`__pycache__/`、`.egg-info/`。
- 修复代码中中文注释的编码显示问题。
- 如果团队允许，再补系统配置模块测试文件。
