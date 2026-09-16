from __future__ import annotations

from pathlib import Path

from wh_local.modules.pod_customization.billing_contract import (
    PodCallOutcome,
    PodExecutionGrant,
)
from wh_local.modules.pod_customization.contracts import SemiBatchCreate
from wh_local.modules.pod_customization.service import PodCustomizationService
from wh_local.session import Actor


class IdleRuntime:
    """整组重试的冻结阶段不发生图，运行时不该被碰到。"""

    def submit(self, *_args, **_kwargs):
        raise AssertionError("style retry freeze must not need the image runtime")


class RecordingBilling:
    def __init__(self) -> None:
        self.plans: list = []

    def freeze(self, actor: Actor, plan):  # noqa: ARG002 - 只记录计划
        self.plans.append(plan)
        return PodExecutionGrant("freeze-1", 1, "2099-01-01T00:00:00Z", {"wuyin": "k"})

    def settle(self, actor: Actor, grant, plan, outcomes) -> None:  # pragma: no cover - 未使用
        return None

    def regrant(self, actor: Actor, freeze_id: str):  # pragma: no cover - 未使用
        raise AssertionError("unexpected regrant")


def _service(tmp_path: Path, billing: RecordingBilling) -> PodCustomizationService:
    return PodCustomizationService(
        tmp_path / "workbench.sqlite3",
        tmp_path / "pod-assets",
        IdleRuntime(),
        # 生产上服务实例始终注入标题服务；半定制是靠 batch mode 关掉标题链路的，
        # 所以这里必须带 title_runtime，才能测出重试计划有没有误带标题调用。
        title_runtime=object(),
        billing_coordinator=billing,
        start_workers=False,
    )


def test_semi_group_retry_freezes_images_only_and_expands_to_four_items(tmp_path: Path) -> None:
    """半定制整组重试不能复用全定制的重试计划。

    全定制计划会带 5 个标题调用，而半定制没有标题链路：那些调用永远不会产生结果，
    冻结按 1 个 link 计（应按 4 款），结算时全量比对过不去，冻结积分也退不回来。
    """
    billing = RecordingBilling()
    service = _service(tmp_path, billing)
    actor = Actor(id="operator-1", username="operator-1", role="operator", workspace_id="workspace-a")
    batch = service.create_semi_batch(actor, SemiBatchCreate(count=8), enqueue=False)
    with service.repository._connect() as connection:
        connection.execute(
            """UPDATE pod_customization_style_grid_results SET status = 'failed'
               WHERE batch_id = ? AND style_index = 1""",
            (batch["id"],),
        )
        connection.execute(
            """UPDATE pod_customization_batches
               SET status = 'partial_failure', completed_count = 1, failed_count = 1
               WHERE batch_id = ?""",
            (batch["id"],),
        )
    billing.plans.clear()

    service.regenerate_style(actor, batch["id"], 1, enqueue=False)

    plan = billing.plans[0]
    assert [call.feature for call in plan.calls] == ["pod.image", "pod.image"]
    assert plan.product_batch_freeze_payload() == {
        "idempotency_key": plan.idempotency_key,
        "link_count": 4,
        "scope": ["four_grid"],
        "billing_profile": plan.billing_profile,
    }
    outcomes = [
        PodCallOutcome(call.call_id, call.feature, "success") for call in plan.calls
    ]
    assert plan.product_batch_settlement_payload(outcomes) == {
        "items": [
            {"link_idx": index, "subitems": [{"feature": "four_grid", "status": "success"}]}
            for index in range(1, 5)
        ]
    }
