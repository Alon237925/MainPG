from __future__ import annotations

from typing import Any


MANUAL_TITLE = "User Manual"
MANUAL_VERSION = "0.1.0"


MANUAL_CHAPTERS: list[dict[str, Any]] = [
    {
        "id": "quick-start",
        "order": 1,
        "title": "快速开始",
        "summary": "第一次使用工作台时需要完成的基础准备。",
        "audience": ["all"],
        "status": "available",
        "sections": [
            {
                "heading": "使用前准备",
                "items": [
                    "确认本地后端服务已经启动。",
                    "确认浏览器可以访问健康检查地址。",
                    "确认已获得工作台账号或开发阶段 token。",
                    "需要插件能力的流程，应先连接 Edge 插件。",
                ],
            },
            {
                "heading": "基础流程",
                "steps": [
                    {"title": "启动本地后端", "body": "在 local-runtime 目录启动 FastAPI 服务。"},
                    {"title": "打开前端页面", "body": "进入工作台页面后，根据角色看到对应菜单。"},
                    {"title": "检查模块状态", "body": "优先查看帮助与诊断，确认后端、配置和插件状态。"},
                ],
            },
        ],
        "related_endpoints": ["GET /health", "GET /desktop/help/diagnostics"],
    },
    {
        "id": "account-auth",
        "order": 2,
        "title": "账号登录与权限",
        "summary": "说明账号登录、本地会话、角色和权限边界。",
        "audience": ["all"],
        "status": "implemented",
        "sections": [
            {
                "heading": "当前能力",
                "items": [
                    "登录注册模块已经有后端框架。",
                    "登录成功后会创建本地工作台会话。",
                    "业务模块后续应依赖本地会话，不直接依赖远端账号 token。",
                ],
            },
            {
                "heading": "待接入事项",
                "items": [
                    "确认远端认证服务地址和字段。",
                    "把内存 session 替换成正式本地存储。",
                    "统一 admin、operator、workspace 权限规则。",
                ],
            },
        ],
        "related_endpoints": [
            "POST /api/customer/login",
            "POST /api/customer/register",
            "GET /api/customer/me",
            "POST /api/customer/logout",
        ],
    },
    {
        "id": "navigation",
        "order": 3,
        "title": "页面导航",
        "summary": "说明工作台各菜单入口和当前接入状态。",
        "audience": ["all"],
        "status": "in_progress",
        "sections": [
            {
                "heading": "主要入口",
                "items": [
                    "每日选品：用于 1688 商品采集、筛选、评分和确认交接。",
                    "产品处理：用于草稿池、批量处理和结果产出，当前仍是规划/待接入状态。",
                    "核价及货源：用于价格确认和货源匹配，当前仍是规划/待接入状态。",
                    "利润活动：用于利润测算、商品入档、活动筛选和 Excel 处理。",
                    "系统配置：用于 AI、图生图、COS 和运行限制配置。",
                    "帮助与诊断：用于查看使用手册、接口状态和本地诊断摘要。",
                ],
            }
        ],
        "related_endpoints": ["GET /desktop/help/status"],
    },
    {
        "id": "daily-selection",
        "order": 4,
        "title": "每日选品",
        "summary": "1688 每日选品采集、筛选、评分、反馈和确认交接。",
        "audience": ["operator", "admin"],
        "status": "implemented",
        "sections": [
            {
                "heading": "功能范围",
                "items": [
                    "支持关键词采集和参考图采集。",
                    "对候选商品做规范化、评分和风险标记。",
                    "保存批次快照，支持后续回看。",
                    "支持人工反馈和候选确认。",
                    "确认后生成 handoff，供下游草稿池或产品库消费。",
                ],
            },
            {
                "heading": "安全边界",
                "items": [
                    "不会自动发布商品。",
                    "不会向 1688 写入商品数据。",
                    "真实 API 密钥由宿主配置注入，不写入手册、日志或响应。",
                ],
            },
        ],
        "related_endpoints": [
            "POST /desktop/daily-selection/preview",
            "GET /desktop/daily-selection/runs",
            "GET /desktop/daily-selection/runs/{run_id}",
            "POST /desktop/daily-selection/runs/{run_id}/feedback",
            "POST /desktop/daily-selection/runs/{run_id}/confirm",
            "GET /desktop/daily-selection/image",
        ],
    },
    {
        "id": "product-processing",
        "order": 5,
        "title": "产品处理",
        "summary": "草稿池、批量处理、AI 生成和结果文件。",
        "audience": ["operator", "admin"],
        "status": "planned",
        "sections": [
            {
                "heading": "规划范围",
                "items": [
                    "管理产品草稿。",
                    "批量处理标题、描述、类目、属性和图片。",
                    "生成处理结果和导出文件。",
                    "标记需要人工复核的商品。",
                ],
            }
        ],
        "related_endpoints": [],
    },
    {
        "id": "price-source",
        "order": 6,
        "title": "核价及货源",
        "summary": "价格确认、货源采集、候选匹配和人工确认。",
        "audience": ["operator", "admin"],
        "status": "planned",
        "sections": [
            {
                "heading": "规划范围",
                "items": [
                    "连接浏览器插件采集平台页面。",
                    "读取价格待确认数据。",
                    "匹配候选货源并保留证据。",
                    "把人工确认后的货源交给产品处理或产品库。",
                ],
            }
        ],
        "related_endpoints": [],
    },
    {
        "id": "profit-activity",
        "order": 7,
        "title": "利润活动",
        "summary": "利润测算、商品入档、活动筛选、Excel 导入和下载。",
        "audience": ["operator", "admin"],
        "status": "implemented",
        "sections": [
            {
                "heading": "功能范围",
                "items": [
                    "维护利润参数和站点公式。",
                    "计算单品利润、总成本、净利润和利润率。",
                    "保存商品档案和图片资产。",
                    "导入商品 Excel，预览并确认入库。",
                    "筛选活动表并下载结果文件。",
                ],
            }
        ],
        "related_endpoints": [
            "GET /profit-activity/settings",
            "PUT /profit-activity/settings",
            "POST /profit-activity/calculate",
            "GET /profit-activity/products",
            "POST /profit-activity/products/import/preview",
            "POST /profit-activity/activity-filter",
        ],
    },
    {
        "id": "system-config",
        "order": 8,
        "title": "系统配置",
        "summary": "管理员配置 AI、图生图、COS、运行限制和发布摘要。",
        "audience": ["admin"],
        "status": "available",
        "sections": [
            {
                "heading": "配置范围",
                "items": [
                    "文本 AI 接口地址、模型和 API Key。",
                    "主图生图接口地址、模型、参考模型和 API Key。",
                    "备用图生图接口地址、模型、参考模型和 API Key。",
                    "COS bucket、region、SecretId 和 SecretKey。",
                    "文本/图片并发、限流、重试和供应商策略。",
                ],
            },
            {
                "heading": "密钥规则",
                "items": [
                    "GET 接口不返回任何密钥明文。",
                    "密钥输入框留空表示不修改旧密钥。",
                    "clear_* 字段为 true 时才表示清空旧密钥。",
                    "前端应显示已配置/未配置，不展示真实密钥。",
                ],
            },
        ],
        "related_endpoints": [
            "GET /desktop/basic-settings/system-config",
            "PUT /desktop/basic-settings/system-config",
            "POST /desktop/basic-settings/system-config/publish",
        ],
    },
    {
        "id": "help-diagnostics",
        "order": 9,
        "title": "使用手册",
        "summary": "查看使用手册、模块状态和本地运行时诊断摘要。",
        "audience": ["all"],
        "status": "available",
        "sections": [
            {
                "heading": "诊断范围",
                "items": [
                    "查看后端版本和数据库路径。",
                    "查看模块是否已实现、是否已挂载。",
                    "查看常见接口入口。",
                    "检查本地数据库是否可访问。",
                ],
            }
        ],
        "related_endpoints": [
            "GET /desktop/help/manual",
            "GET /desktop/help/manual/chapters",
            "GET /desktop/help/status",
            "GET /desktop/help/diagnostics",
        ],
    },
    {
        "id": "api-status-appendix",
        "order": 10,
        "title": "附录：接口与状态说明",
        "summary": "统一解释接口状态、错误码和模块接入状态。",
        "audience": ["admin", "operator"],
        "status": "available",
        "sections": [
            {
                "heading": "模块状态",
                "items": [
                    "available：已挂载到主应用，可以直接访问。",
                    "implemented：后端代码已存在，但还没有挂载到主应用。",
                    "in_progress：正在开发或集成中。",
                    "planned：已规划但当前版本未实现。",
                ],
            },
            {
                "heading": "常见错误",
                "items": [
                    "401：没有登录或没有传 Bearer token。",
                    "403：当前用户没有权限。",
                    "404：接口未挂载或路径错误。",
                    "422：请求字段校验失败。",
                    "503：依赖服务不可用。",
                ],
            },
        ],
        "related_endpoints": ["GET /desktop/help/status", "GET /desktop/help/diagnostics"],
    },
]


MODULE_STATUSES: list[dict[str, Any]] = [
    {
        "id": "basic-settings",
        "name": "系统配置",
        "status": "available",
        "mounted": True,
        "description": "AI、图片、COS 和运行限制配置。",
        "endpoints": [
            "GET /desktop/basic-settings/system-config",
            "PUT /desktop/basic-settings/system-config",
            "POST /desktop/basic-settings/system-config/publish",
        ],
    },
    {
        "id": "customer-auth",
        "name": "账号登录与权限",
        "status": "implemented",
        "mounted": False,
        "description": "客户账号登录注册和本地 session 框架。",
        "endpoints": ["POST /api/customer/login", "GET /api/customer/me"],
    },
    {
        "id": "daily-selection",
        "name": "每日选品",
        "status": "implemented",
        "mounted": False,
        "description": "1688 采集、筛选、评分、反馈和 handoff。",
        "endpoints": [
            "POST /desktop/daily-selection/preview",
            "GET /desktop/daily-selection/runs",
            "POST /desktop/daily-selection/runs/{run_id}/confirm",
        ],
    },
    {
        "id": "product-processing",
        "name": "产品处理",
        "status": "planned",
        "mounted": False,
        "description": "草稿池、批量处理、AI 生成和结果文件。",
        "endpoints": [],
    },
    {
        "id": "price-source",
        "name": "核价及货源",
        "status": "planned",
        "mounted": False,
        "description": "平台核价、货源采集、候选匹配和人工确认。",
        "endpoints": [],
    },
    {
        "id": "profit-activity",
        "name": "利润活动",
        "status": "implemented",
        "mounted": False,
        "description": "利润测算、商品入档、Excel 导入和活动筛选。",
        "endpoints": ["GET /profit-activity/settings", "POST /profit-activity/activity-filter"],
    },
    {
        "id": "help-diagnostics",
        "name": "使用手册",
        "status": "available",
        "mounted": True,
        "description": "使用手册、模块状态和本地诊断摘要。",
        "endpoints": [
            "GET /desktop/help/manual",
            "GET /desktop/help/status",
            "GET /desktop/help/diagnostics",
        ],
    },
]
