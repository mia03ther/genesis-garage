import qrcode from "../vendor/qrcode.mjs";
import { MONAD, publicRpc } from "../community/gateway.js";
import { ADDRESS, GarageRegistry, versionId } from "./chain.js";
import { BUDGET, MOTORS, TIRES, SECTIONS, STOCK, cost, key, parseBuild, score, trackPosition } from "./rules.js";
import { makeScene } from "./scene.js";

const $ = (id) => document.getElementById(id);
const scene = makeScene($("scene"));
const query = new URLSearchParams(location.search);
const linkBuild = query.get("build");
const sharedBuild = query.get("v") === "1" ? parseBuild(linkBuild) : null;
const parts = [
  { slot: "motor", name: "电机", options: MOTORS },
  { slot: "tires", name: "轮胎", options: TIRES },
];
const add = (parent, tag, text, className) => {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
};

let reference = sharedBuild ?? STOCK;
let loadout = { ...reference, boost: 0 };
let run = null;
let result = null;
let registry = null;
let parentVersion = 0n;
let pending = null;
let publishing = false;
let sectorIndex = -1;
let liftFrame = 0;

const sectors = SECTIONS.map(({ name }) => add($("sectors"), "li", name));
for (const part of parts) {
  const field = add($("parts"), "fieldset");
  add(field, "legend", part.name);
  const options = add(field, "div", "", "part-options");
  part.buttons = part.options.map(({ name, cost: price }, id) => {
    const button = add(options, "button", "", "part");
    button.type = "button";
    add(button, "strong", name);
    add(button, "small", `${price} 点`);
    button.addEventListener("click", () => {
      if (run || result || loadout[part.slot] === id || cost({ ...loadout, [part.slot]: id }) > BUDGET) return;
      const previous = loadout;
      loadout = { ...loadout, [part.slot]: id };
      updateOptions();
      $("status").textContent = `${part.options[previous[part.slot]].name}已拆下，${name}已装上。`;
      changeAnimation(previous, part.slot);
    });
    return button;
  });
  part.note = add(field, "p", "", "part-note");
}

function seconds(milliseconds) { return (milliseconds / 1000).toFixed(3); }
function delta(milliseconds) { return `${milliseconds > 0 ? "+" : ""}${seconds(milliseconds)}s`; }

function timeText(target, ms) {
  const units = document.createElement("span");
  units.textContent = "s";
  target.replaceChildren(seconds(ms), units);
}

function updateOptions() {
  $("budget").textContent = `${cost(loadout)} / ${BUDGET} 点`;
  for (const part of parts) {
    part.note.textContent = part.options[loadout[part.slot]].note;
    part.buttons.forEach((button, id) => {
      button.setAttribute("aria-pressed", String(loadout[part.slot] === id));
      button.disabled = cost({ ...loadout, [part.slot]: id }) > BUDGET;
      button.title = button.disabled ? "超出改装预算" : part.options[id].note;
    });
  }
}

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
function changeAnimation(previous, slot) {
  cancelAnimationFrame(liftFrame);
  if (reducedMotion.matches) {
    scene.workshop(loadout);
    return;
  }
  const start = performance.now();
  const next = loadout;
  function frame(now) {
    const progress = Math.min((now - start) / 420, 1);
    scene.workshop(progress < 0.5 ? previous : next, slot, Math.sin(progress * Math.PI) * 32);
    if (progress < 1) liftFrame = requestAnimationFrame(frame);
  }
  liftFrame = requestAnimationFrame(frame);
}

function garage() {
  result = null;
  $("panel-title").textContent = "改装台";
  $("scene-label").textContent = "PIT · 改装台";
  $("scene").setAttribute("aria-label", "霓虹工坊里待改装的越野车");
  $("parts").hidden = false;
  $("budget").hidden = false;
  $("race").hidden = true;
  $("result").hidden = true;
  $("run").hidden = false;
  $("retry").hidden = true;
  $("share").hidden = true;
  $("boost").hidden = true;
  $("invite").hidden = false;
  $("status").textContent = "";
  showSector(-1);
  updateOptions();
  updatePublish();
  scene.workshop(loadout);
}

function showSector(index) {
  sectorIndex = index;
  sectors.forEach((sector, i) => {
    if (i === index) sector.setAttribute("aria-current", "step");
    else sector.removeAttribute("aria-current");
  });
  if (index < 0) return;
  $("race-section").textContent = SECTIONS[index].name;
  $("race-hint").textContent = run.build.boost
    ? `冲刺已用在${SECTIONS[run.build.boost - 1].name}。`
    : index === 1 ? "积水弯冲刺容易打滑。" : "整圈只有一次冲刺。";
}

// Screen playback is accelerated. The scored inputs are the parts and the chosen sector.
const PLAYBACK_SPEED = 1.55;

function frame(now) {
  const elapsed = Math.max(0, (now - run.startedAt) * PLAYBACK_SPEED);
  const { splits, ms } = score(run.build);
  const player = trackPosition(splits, elapsed);
  const ghost = trackPosition(run.reference.splits, elapsed);
  const next = Math.min(SECTIONS.length - 1, Math.floor(player));
  if (next !== sectorIndex) showSector(next);
  $("boost").disabled = run.build.boost !== 0 || player >= SECTIONS.length;
  timeText($("time"), Math.min(ms, Math.round(elapsed)));
  scene.course(reducedMotion.matches ? Math.floor(player) : player,
    reducedMotion.matches ? Math.floor(ghost) : ghost,
    run.build, reference, elapsed, elapsed < run.flashUntil);

  if (elapsed < Math.max(ms, run.reference.ms)) requestAnimationFrame(frame);
  else finish(run.build, { splits, ms });
}

function start() {
  if (run || publishing) return;
  cancelAnimationFrame(liftFrame);
  run = { build: { ...loadout, boost: 0 }, reference: score(reference), startedAt: performance.now(), flashUntil: 0 };
  $("panel-title").textContent = "试跑中";
  $("scene-label").textContent = "LIVE · 试跑";
  $("scene").setAttribute("aria-label", "紫色试跑车与灰色参考车同屏比赛");
  $("parts").hidden = true;
  $("budget").hidden = true;
  $("run").hidden = true;
  $("invite").hidden = true;
  $("race").hidden = false;
  $("boost").disabled = false;
  $("boost").hidden = false;
  $("status").textContent = "";
  showSector(0);
  $("boost").focus({ preventScroll: true });
  requestAnimationFrame(frame);
}

function boost() {
  if (!run || run.build.boost !== 0) return;
  const elapsed = (performance.now() - run.startedAt) * PLAYBACK_SPEED;
  const actualSector = Math.floor(trackPosition(score(run.build).splits, elapsed));
  if (actualSector >= SECTIONS.length) return;
  run.build.boost = actualSector + 1;
  run.flashUntil = elapsed + 950;
  showSector(actualSector);
  $("boost").disabled = true;
  $("status").textContent = `冲刺：${SECTIONS[actualSector].name}`;
}

function finish(build, lap) {
  const against = run.reference;
  result = { build, version: null };
  run = null;
  const diff = lap.ms - against.ms;
  $("panel-title").textContent = "试跑成绩";
  $("scene-label").textContent = "FINISH · 完赛";
  $("race").hidden = true;
  $("boost").hidden = true;
  $("result").hidden = false;
  $("retry").hidden = false;
  $("share").hidden = false;
  $("status").textContent = "";
  $("splits").replaceChildren();
  $("verdict").textContent = diff === 0 ? "与参考车打平" :
    `${diff < 0 ? "快了" : "慢了"} ${seconds(Math.abs(diff))} 秒`;
  $("verdict").classList.toggle("slower", diff > 0);
  timeText($("result-time"), lap.ms);
  lap.splits.forEach((ms, i) => {
    const change = ms - against.splits[i];
    const row = add($("splits"), "li");
    add(row, "span", SECTIONS[i].name);
    add(row, "strong", delta(change), change < 0 ? "faster" : change > 0 ? "slower" : "");
  });
  updatePublish();
  $("retry").focus({ preventScroll: true });
}

function share(build, version) {
  const url = registry && version !== null ? versionLink(version) : new URL("garage.html", location.href);
  if (!url.searchParams.has("registry")) {
    url.searchParams.set("v", "1");
    url.searchParams.set("build", key(build));
  }
  const qr = qrcode(0, "M");
  qr.addData(url.href);
  qr.make();
  $("qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
  $("share-link").value = url.href;
  $("share-status").textContent = "";
  $("share-dialog").showModal();
}

function versionLink(version) {
  const url = new URL("garage.html", location.href);
  url.searchParams.set("registry", registry.address);
  url.searchParams.set("version", version.toString());
  return url;
}

function updatePublish() {
  const changed = result && key(result.build) !== key(reference);
  $("publish").disabled = publishing || !registry || (!pending && (!changed || result.version !== null));
  $("publish").textContent = pending ? "查询确认" : "保存试跑版本";
  $("retry").disabled = publishing;
}

async function loadRegistry(address, id) {
  // A link can choose an address and version, but the page always pins the network and bytecode.
  const version = versionId(id);
  if (!ADDRESS.test(address)) throw Error("无效工坊合约地址");
  const response = await fetch(new URL("./build.json", import.meta.url));
  if (!response.ok) throw Error("无法加载工坊合约配置");
  const gateway = new GarageRegistry(publicRpc, address, MONAD.id, await response.json());
  await gateway.check();
  const record = await gateway.read(version);
  registry = gateway;
  parentVersion = record.version;
  reference = record.build;
  loadout = { ...reference, boost: 0 };
  $("mode").textContent = "MONAD TESTNET";
  $("ghost-label").textContent = `链上 V${parentVersion}`;
  $("chain-status").textContent = "";
  $("version-details").hidden = false;
  $("version-number").textContent = `V${parentVersion}`;
  $("version-score").textContent = `${seconds(record.timeMs)}s`;
  $("version-author").textContent = record.version === 0n ? "原装车" : record.author;
  if (record.version > 0n) {
    $("parent-version").href = versionLink(record.parent).href;
    $("parent-version").textContent = `查看父版本 V${record.parent}`;
    $("parent-version").hidden = false;
  }
  garage();
}

async function publish() {
  if (publishing || !registry || (!pending && !result)) return;
  publishing = true;
  updatePublish();
  try {
    if (!pending) {
      const wallet = window.ethereum;
      if (!wallet?.request) throw Error("在带测试钱包的浏览器中打开此页面");
      $("chain-status").textContent = "请在钱包中确认测试网账号和交易。";
      const accounts = await wallet.request({ method: "eth_requestAccounts" });
      if (await wallet.request({ method: "eth_chainId" }) !== MONAD.id) {
        await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: MONAD.id }] });
      }
      if (await wallet.request({ method: "eth_chainId" }) !== MONAD.id) throw Error("请切换到 Monad Testnet");
      const [from] = await wallet.request({ method: "eth_accounts" });
      if (!accounts.length || !from) throw Error("未连接测试钱包账号");
      const build = result.build;
      const tx = registry.transaction(from, parentVersion, build);
      const hash = await wallet.request({ method: "eth_sendTransaction", params: [tx] });
      if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw Error("钱包没有返回有效交易哈希");
      pending = { hash, from, parent: parentVersion, build, broadcastAt: performance.now(), result };
      $("transaction").href = `${MONAD.explorer}/tx/${hash}`;
      $("transaction").hidden = false;
    }
    $("chain-status").textContent = "已广播，等待最终确认。";
    for (let i = 0; i < 15; i++) {
      const confirmed = await registry.confirmed(pending.hash, pending);
      if (confirmed) {
        const elapsed = Math.round(performance.now() - pending.broadcastAt);
        pending.result.version = confirmed.version;
        $("published-version").href = versionLink(confirmed.version).href;
        $("published-version").textContent = `打开 V${confirmed.version}`;
        $("published-version").hidden = false;
        $("chain-status").textContent = `已保存 V${confirmed.version} · 来自 V${confirmed.parent} · 本机确认 ${elapsed} ms`;
        pending = null;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    $("chain-status").textContent = "仍在等待，可查询本笔交易的确认结果。";
  } catch (error) {
    if (error.code === "GARAGE_REVERTED") pending = null;
    $("chain-status").textContent = error.message || "无法读取交易结果";
  } finally {
    publishing = false;
    updatePublish();
  }
}

$("run").addEventListener("click", start);
$("boost").addEventListener("click", boost);
$("retry").addEventListener("click", () => { garage(); $("run").focus({ preventScroll: true }); });
$("invite").addEventListener("click", () => share(reference, registry ? parentVersion : null));
$("share").addEventListener("click", () => share(result.build, result.version));
$("publish").addEventListener("click", publish);
$("registry-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const url = new URL("garage.html", location.href);
  url.searchParams.set("registry", $("registry").value.trim());
  try {
    url.searchParams.set("version", versionId($("version-input").value).toString());
  } catch (error) {
    $("chain-status").textContent = error.message;
    return;
  }
  location.assign(url.href);
});
$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("share-link").value);
    $("share-status").textContent = "链接已复制";
  } catch {
    $("share-link").focus();
    $("share-link").select();
    $("share-status").textContent = "请复制选中的挑战链接";
  }
});
window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && run && !event.repeat && !event.target.closest("input, textarea, button, summary, a")) {
    event.preventDefault();
    boost();
  }
});

garage();
if (sharedBuild) $("ghost-label").textContent = "好友参考车";
if (linkBuild && !sharedBuild) $("status").textContent = "挑战链接无效，已载入原装车。";
if (query.has("registry")) {
  $("registry-form").closest("details").open = true;
  $("registry").value = query.get("registry");
  $("version-input").value = query.get("version") ?? "0";
  $("chain-status").textContent = "读取已确认的蓝图…";
  $("run").disabled = true;
  loadRegistry($("registry").value, $("version-input").value)
    .catch((error) => { $("chain-status").textContent = error.message; })
    .finally(() => { $("run").disabled = false; });
}
