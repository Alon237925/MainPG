import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const OneboundPageCapture = require("./onebound_page_capture.js");

function fakeAnchor({ id = "", spm = "", href = "", relative = false }) {
  return {
    id,
    href: href && !relative ? href : href,
    getAttribute(name) {
      if (name === "data-spm-anchor-id") return spm;
      if (name === "href") return href;
      return "";
    },
  };
}

function fakeTaobaoDocument(anchors) {
  return {
    documentElement: { scrollHeight: 4000 },
    body: { scrollHeight: 4000 },
    querySelectorAll(selector) {
      // scanPage 在淘宝页使用的组合选择器：id 前缀、spm 前缀或任意带 href 的锚点。
      assert.match(selector, /^a\[id\^="item_id_"\]/);
      assert.match(selector, /a\[data-spm-anchor-id\^="aItem_id_"\]/);
      assert.match(selector, /a\[href\]$/);
      return anchors.filter(
        (anchor) =>
          /^item_id_/.test(String(anchor.id || ""))
          || /^aItem_id_/.test(String(anchor.spm || ""))
          || Boolean(anchor.href)
      );
    },
  };
}

function fakeTaobaoPage(anchors, { scrollPasses = 1, sleepMs = 0 } = {}) {
  const document = fakeTaobaoDocument(anchors);
  let scrollY = 0;
  let scrollCalls = 0;
  return {
    location: { href: "https://s.taobao.com/search?q=%E8%84%8F%E8%A1%A3%E7%AF%93", hostname: "s.taobao.com" },
    document,
    scrollY,
    scrollTo(_x, y) {
      scrollY = Number(y || 0);
      scrollCalls += 1;
    },
    get scrollPosition() {
      return scrollY;
    },
    get scrollCalls() {
      return scrollCalls;
    },
  };
}

test("canonicalizeOfferUrl normalizes taobao card links to item.taobao.com", () => {
  assert.equal(
    OneboundPageCapture.canonicalizeOfferUrl("https://item.taobao.com/item.htm?id=770472693092&spm=a21n57"),
    "https://item.taobao.com/item.htm?id=770472693092"
  );
  assert.equal(
    OneboundPageCapture.canonicalizeOfferUrl("https://detail.tmall.com/item.htm?id=770472693092&skuId=123"),
    "https://item.taobao.com/item.htm?id=770472693092"
  );
  assert.equal(
    OneboundPageCapture.canonicalizeOfferUrl("https://t.taobao.com/item.htm?num_iid=770472693092"),
    "https://item.taobao.com/item.htm?id=770472693092"
  );
  // 非商品参数名 / 非淘宝域名一律拒绝
  assert.equal(OneboundPageCapture.canonicalizeOfferUrl("https://item.taobao.com/item.htm?skuId=123"), "");
  assert.equal(OneboundPageCapture.canonicalizeOfferUrl("https://detail.1688.com/offer/123456.html"), "https://detail.1688.com/offer/123456.html");
  assert.equal(OneboundPageCapture.canonicalizeOfferUrl("https://example.com/item.htm?id=770472693092"), "");
  assert.equal(OneboundPageCapture.canonicalizeOfferUrl("https://item.taobao.com/item.htm?id=abc"), "");
});

test("canonicalizeOfferUrls deduplicates and caps the taobao item list", () => {
  const urls = OneboundPageCapture.canonicalizeOfferUrls([
    "https://item.taobao.com/item.htm?id=770472693092",
    "https://detail.tmall.com/item.htm?id=770472693092",
    "https://item.taobao.com/item.htm?id=6181111111111",
    "https://not-taobao.com/item.htm?id=123",
    "",
  ], 3);
  assert.deepEqual(urls, [
    "https://item.taobao.com/item.htm?id=770472693092",
    "https://item.taobao.com/item.htm?id=6181111111111",
  ]);
});

test("scanPage extracts taobao item ids from card anchors and scrolls the page", async () => {
  const anchors = [
    fakeAnchor({ id: "item_id_770472693092", spm: "aItem_id_770472693092_doubleCardWrapperAdapt--mEcC7olq", href: "/i770472693092.htm" }),
    fakeAnchor({ id: "", spm: "aItem_id_6181111111111_doubleCardWrapperAdapt--abc123", href: "https://detail.tmall.com/item.htm?id=6181111111111&skuId=9" }),
    fakeAnchor({ id: "nav-link", spm: "", href: "/" }),
    fakeAnchor({ id: "item_id_96222", spm: "", href: "https://item.taobao.com/item.htm?id=96222" }),
  ];
  const page = fakeTaobaoPage(anchors, { scrollPasses: 1 });
  const result = await OneboundPageCapture.scanPage({
    page,
    maxItems: 3,
    maxScrollPasses: 1,
    scrollWaitMs: 0,
    sleep: async () => {},
  });
  assert.equal(result.page_url, page.location.href);
  assert.deepEqual(result.source_urls, [
    "https://item.taobao.com/item.htm?id=770472693092",
    "https://item.taobao.com/item.htm?id=6181111111111",
  ]);
  assert.equal(result.total_candidates, 2);
});

test("scanPage keeps 1688 offer extraction unchanged", async () => {
  const anchors = [
    fakeAnchor({ href: "https://detail.1688.com/offer/123456.html" }),
    fakeAnchor({ href: "https://detail.m.1688.com/page/index.html?offerId=654321" }),
    fakeAnchor({ href: "https://www.example.com/" }),
  ];
  const page = {
    location: { href: "https://s.1688.com/selloffer/offer_search.htm?keywords=test", hostname: "s.1688.com" },
    document: {
      documentElement: { scrollHeight: 4000 },
      body: { scrollHeight: 4000 },
      querySelectorAll(selector) {
        assert.equal(selector, "a[href]");
        return anchors;
      },
    },
    scrollTo() {},
    scrollY: 0,
  };
  const result = await OneboundPageCapture.scanPage({
    page,
    maxItems: 3,
    maxScrollPasses: 0,
    scrollWaitMs: 0,
    sleep: async () => {},
  });
  assert.deepEqual(result.source_urls, [
    "https://detail.1688.com/offer/123456.html",
    "https://detail.1688.com/offer/654321.html",
  ]);
});
