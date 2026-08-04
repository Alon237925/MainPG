# User Manual Backend

第一版使用手册后端，不使用数据库表，手册内容直接维护在 `content.py`。

## 接口

```text
GET /desktop/help/manual
GET /desktop/help/manual/chapters
GET /desktop/help/manual/chapters/{chapter_id}
GET /desktop/help/status
GET /desktop/help/diagnostics
```

## 说明

- 前端只负责展示使用手册目录、章节、模块状态和诊断摘要。
- 后端返回结构化 JSON，便于前端做目录、步骤卡片、状态标签和 FAQ。
- 不返回 API Key、Secret、token、cookie 等敏感信息。
- 后续如需在线编辑，可把 `content.py` 替换为 Markdown 文件或数据库读取。
