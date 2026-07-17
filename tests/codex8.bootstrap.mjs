import assert from "node:assert/strict";
import test from "node:test";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.id = "";
    this.dataset = {};
    this.style = {};
    this.disabled = false;
    this.children = [];
    this.attributes = {};
    this.listeners = new Map();
    this.textContent = "";
    this.parent = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  prepend(child) {
    child.parent = this;
    this.children.unshift(child);
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
}

function findById(root, id) {
  if (root.id === id) return root;

  for (const child of root.children) {
    const found = findById(child, id);
    if (found) return found;
  }

  return null;
}

test("app startup disables controls until lookup load and exposes retry on failure", async () => {
  const appShell = new FakeElement("div");
  const gameButton = new FakeElement("button");
  let rejectFetch;

  globalThis.document = {
    body: appShell,
    querySelectorAll: () => [gameButton],
    querySelector: (selector) => (selector === ".app-shell" ? appShell : null),
    getElementById: (id) => findById(appShell, id),
    createElement: (tagName) => new FakeElement(tagName),
  };
  globalThis.fetch = () =>
    new Promise((resolve, reject) => {
      rejectFetch = reject;
    });

  const { bootstrapApp } = await import(
    `../bootstrap/appBootstrap.js?startup=${Date.now()}`
  );
  const startup = bootstrapApp();
  const loadingStatus = document.getElementById("evLaLookupStartupStatus");

  assert.equal(gameButton.disabled, true);
  assert.equal(gameButton.listeners.size, 0);
  assert.equal(loadingStatus.attributes.role, "status");
  assert.match(loadingStatus.children[0].textContent, /読み込んでいます/);

  rejectFetch(new Error("Injected lookup failure"));
  await assert.rejects(
    startup,
    (error) => error.code === "EV_LA_LOOKUP_LOAD_FAILED"
  );

  const errorStatus = document.getElementById("evLaLookupStartupStatus");
  const retryButton = errorStatus.children[1];

  assert.equal(gameButton.disabled, true);
  assert.equal(errorStatus.attributes.role, "alert");
  assert.match(errorStatus.children[0].textContent, /試合操作は停止中/);
  assert.equal(retryButton.textContent, "再読み込み");
  assert.equal(retryButton.disabled, false);
  assert.equal(retryButton.listeners.has("click"), true);
});
