const fs = require("fs");
const vm = require("vm");

function makeElement(id = "") {
  return {
    id,
    innerHTML: "",
    textContent: "",
    disabled: false,
    value: "",
    checked: false,
    dataset: {},
    style: {},
    children: [],
    parentNode: { insertBefore() {} },
    className: "",
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; }
    },
    appendChild(child) { this.children.push(child); return child; },
    insertBefore(child) { this.children.push(child); return child; },
    remove() {},
    removeAttribute() {},
    setAttribute() {}
  };
}

const elements = new Map();
function el(id) {
  if (!elements.has(id)) elements.set(id, makeElement(id));
  return elements.get(id);
}

const documentStub = {
  addEventListener() {},
  getElementById: el,
  createElement: tag => makeElement(tag),
  querySelector: selector => {
    if (selector === ".log-wrap") return el("logWrap");
    return makeElement(selector);
  },
  querySelectorAll: () => []
};

const localStorageStub = {
  data: Object.create(null),
  getItem(key) { return this.data[key] ?? null; },
  setItem(key, value) { this.data[key] = String(value); },
  removeItem(key) { delete this.data[key]; }
};

const context = {
  console,
  document: documentStub,
  localStorage: localStorageStub,
  window: { addEventListener() {} },
  navigator: {},
  alert() {},
  confirm() { return true; },
  setTimeout(fn) { fn(); return 0; },
  setInterval() { return 0; },
  Date,
  Math,
  JSON
};

const app = fs.readFileSync("app.js", "utf8");
const test = `
function resetAuctionOnly() {
  history=[]; lastBidVal=0; lastBidStr=''; lastBidSeat=null;
  doubled=false; redoubled=false; passCount=0; gameOver=false;
  selLvl=null; selSuit=null; playActive=false;
  const d=makeDeck();
  hands={N:d.slice(0,13),E:d.slice(13,26),S:d.slice(26,39),W:d.slice(39,52)};
  Object.keys(hands).forEach(p=>sortHand(hands[p]));
}

function runAuction(mode) {
  resetAuctionOnly();
  biddingPracticeMode=mode || null;
  let safety=0;
  while(!gameOver && safety++ < 80) {
    const seat=currentSeat();
    let m;
    if (biddingPracticeMode==='partner_only' && (seat==='E'||seat==='W')) m={bid:'PASS'};
    else m=getAIBid(seat)||{bid:'PASS'};
    record(m.bid,seat,m.isX||false,m.isXX||false);
  }
  return {
    finished: gameOver,
    bids: history.length,
    contract: lastBidStr || "PASS",
    lastBidSeat: lastBidSeat || "",
    overflow: safety >= 80
  };
}

function runPlayFromAuction() {
  if(!lastBidStr) return {played:false, reason:"all-pass"};
  try { startPlay(); } catch(e) { return {played:false, error:e.message}; }
  let safety=0;
  while(playActive && safety++ < 80) {
    const seat=currentTrickSeat;
    const h=playHands[seat] || [];
    const legal=h.filter(c=>isLegal(seat,c));
    const card=chooseCard(seat,h) || legal[0] || h[0];
    if(!card) return {played:false, error:"no-card", seat};
    playCard(seat,card);
  }
  return {
    played:true,
    completed:!playActive,
    steps:safety,
    tricksDeclarer,
    tricksDefenders,
    overflow:safety>=80
  };
}

const summary={auctions:[], plays:[], errors:[]};
for (const mode of [null, "partner_only", "ew_ai"]) {
  for (let i=0;i<25;i++) {
    try {
      const auction=runAuction(mode);
      summary.auctions.push({mode:mode||"ai_bridge", ...auction});
      if(!mode) summary.plays.push(runPlayFromAuction());
    } catch(e) {
      summary.errors.push({mode:mode||"ai_bridge", error:e.message, stack:e.stack});
    }
  }
}

function count(arr, pred){ return arr.filter(pred).length; }
const result={
  auctionCount: summary.auctions.length,
  playCount: summary.plays.length,
  errors: summary.errors.length,
  auctionOverflows: count(summary.auctions, a=>a.overflow || !a.finished),
  playOverflows: count(summary.plays, p=>p.overflow || !p.completed),
  allPass: count(summary.auctions, a=>a.contract==="PASS"),
  avgAuctionBids: Math.round(summary.auctions.reduce((s,a)=>s+a.bids,0)/summary.auctions.length*10)/10,
  sampleAuctions: summary.auctions.slice(0,8),
  samplePlays: summary.plays.slice(0,5),
  firstError: summary.errors[0] || null
};
console.log(JSON.stringify(result,null,2));
`;

vm.runInNewContext(app + "\n" + test, context, { filename: "app.js" });
