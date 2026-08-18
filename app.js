/* ════════════════════════════════════════════════════
   KOD KORUMA — caydırıcı önlem (kesin/aşılamaz DEĞİL)
   Sağ tık ve geliştirici araçları kısayolları engellenir.
   Teknik bilgisi olan biri yine de tarayıcı menüsünden
   veya dosyayı doğrudan bir editörle açarak kodu görebilir.
════════════════════════════════════════════════════ */
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('keydown', e => {
  const k = e.key;
  if (k === 'F12') { e.preventDefault(); return; }
  if (e.ctrlKey && e.shiftKey && ['I','J','C','i','j','c'].includes(k)) { e.preventDefault(); return; }
  if (e.ctrlKey && (k === 'u' || k === 'U')) { e.preventDefault(); return; }
});

/* ════════════════════════════════════════════════════
   CONSTANTS
════════════════════════════════════════════════════ */
const SUITS={S:{sym:'♠',col:'#1a1a1a',val:4},H:{sym:'♥',col:'#c0392b',val:3},D:{sym:'♦',col:'#c0392b',val:2},C:{sym:'♣',col:'#1a1a1a',val:1}};
const SK=['S','H','D','C'];
const RANKS=['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
const HV={A:4,K:3,Q:2,J:1};
const SEAT=['N','E','S','W']; // dealer = North, clockwise
const SUIT_ORDER={C:1,D:2,H:3,S:4,NT:5};

/* ════════════════════════════════════════════════════
   GAME SESSION STATE (persists across deals)
════════════════════════════════════════════════════ */
let dealerIdx=0;          // 0=N,1=E,2=S,3=W rotates each deal
let vulNS=false,vulEW=false;  // vulnerability
let scoreNS=0,scoreEW=0;  // cumulative rubber/match score
let dealNumber=0;         // deal counter

// Vulnerability rotation (standard bridge):
// Deal 1: none vul, Deal 2: NS vul, Deal 3: EW vul, Deal 4: both vul
// Then repeats
const VUL_TABLE=[
  {ns:false,ew:false}, // 1
  {ns:true, ew:false}, // 2
  {ns:false,ew:true},  // 3
  {ns:true, ew:true},  // 4
  {ns:true, ew:false}, // 5
  {ns:false,ew:true},  // 6 — standard WBF cycle (simplified)
  {ns:true, ew:true},  // 7
  {ns:false,ew:false}, // 8
];

/* ════════════════════════════════════════════════════
   BIDDING STATE
════════════════════════════════════════════════════ */
let hands={},history=[],lastBidVal=0,lastBidStr='',lastBidSeat=null;
let doubled=false,redoubled=false,passCount=0,gameOver=false;
let selLvl=null,selSuit=null;

/* ════════════════════════════════════════════════════
   PLAY STATE
════════════════════════════════════════════════════ */
let playActive=false,trump=null,declarer=null,dummy=null,contractLevel=0;
let defL=null,defR=null,currentTrickSeat=null;
let currentTrick=[],tricksDeclarer=0,tricksDefenders=0,trickCount=0;
let activeAISeat=null;
let playHands={},ledSuit=null,playHistory=[];
let biddingPracticeMode=null;

// AI PLAY DIFFICULTY — DD is a controlled component, not the whole AI.
// Level 1: heuristic only; Level 2: occasional DD; Level 3: frequent DD;
// Level 4: maximum DD assistance. The AI still decides first; DD is only
// consulted according to the selected difficulty.
const AI_LEVELS={
  1:{name:'Beginner',ddRate:0.20},
  2:{name:'Club',ddRate:0.65},
  3:{name:'Advanced',ddRate:0.80},
  4:{name:'Master',ddRate:1.00}
};
let aiDifficulty=Number(localStorage.getItem('bridgeAIDifficulty'))||4;
const PROFILE_STORAGE_KEY='bridgeSystemProfile';
const MODE_STORAGE_KEY='bridgeGameMode';
let currentGameMode=null;
function getAIDDRate(){
  return (AI_LEVELS[aiDifficulty]||AI_LEVELS[4]).ddRate;
}
function setAIDifficulty(level,skipSave=false){
  level=Math.max(1,Math.min(4,Number(level)||4));
  aiDifficulty=level;
  if(!skipSave) localStorage.setItem('bridgeAIDifficulty',String(aiDifficulty));
  document.querySelectorAll('[data-ai-level]').forEach(b=>{
    b.classList.toggle('on',Number(b.dataset.aiLevel)===aiDifficulty);
  });
  document.querySelectorAll('input[name="aiLevelChoice"]').forEach(input=>{
    input.checked=Number(input.value)===aiDifficulty;
  });
  const label=el('aiLevelLabel');
  const cfg=AI_LEVELS[aiDifficulty]||AI_LEVELS[4];
  if(label) label.textContent=cfg.name;
}
function openSystemProfile(){
  loadSystemProfile(false);
  const intro=el('profileIntro');
  if(intro) intro.innerHTML='Tercihlerinizi seçin. Sistem, konvansiyonlar ve AI seviyesi bu cihazda saklanır.';
  const overlay=el('profileOverlay');
  if(overlay) overlay.classList.add('show');
}
function closeSystemProfile(){
  const overlay=el('profileOverlay');
  if(overlay) overlay.classList.remove('show');
}
function toggleAdvancedConventions(){
  const panel=el('advancedConventions');
  const btn=el('advancedToggle');
  if(!panel) return;
  panel.classList.toggle('show');
  if(btn) btn.textContent=panel.classList.contains('show')?'－ İleri konvansiyonları gizle':'＋ İleri konvansiyonları göster';
}
function applyConventionProfile(conventions){
  const enabled=new Set(conventions||[]);
  CONVENTIONS.michaels=enabled.has('michaels');
  CONVENTIONS.unusual2NT=enabled.has('unusual_2nt');
  CONVENTIONS.responsiveDouble=enabled.has('responsive_double');
  CONVENTIONS.supportDouble=enabled.has('support_double');
  CONVENTIONS.penaltyDoubles=true;
}
function loadSystemProfile(showOnboarding=true){
  try{
    const profile=JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY)||'null');
    if(profile){
      const sys=document.querySelector(`input[name="bridgeSystem"][value="${profile.system||'sayc'}"]`);
      if(sys) sys.checked=true;
      if(profile.aiDifficulty) aiDifficulty=Number(profile.aiDifficulty)||aiDifficulty;
      document.querySelectorAll('input[name="conv"]').forEach(input=>{
        input.checked=(profile.conventions||[]).includes(input.value);
      });
      applyConventionProfile(profile.conventions||[]);
      if(showOnboarding && !profile.aiDifficulty){
        const overlay=el('profileOverlay');
        if(overlay) overlay.classList.add('show');
      }
    }else{
      applyConventionProfile(['stayman','transfer','rkcb','negative_double']);
      if(showOnboarding){
        const overlay=el('profileOverlay');
        if(overlay) overlay.classList.add('show');
      }
    }
  }catch(e){
    if(showOnboarding){
      const overlay=el('profileOverlay');
      if(overlay) overlay.classList.add('show');
    }
  }
  setAIDifficulty(aiDifficulty,true);
}
function saveSystemProfile(){
  const systemEl=document.querySelector('input[name="bridgeSystem"]:checked');
  const aiLevelEl=document.querySelector('input[name="aiLevelChoice"]:checked');
  const conventions=[...document.querySelectorAll('input[name="conv"]:checked')].map(input=>input.value);
  setAIDifficulty(aiLevelEl?aiLevelEl.value:aiDifficulty);
  applyConventionProfile(conventions);
  localStorage.setItem(PROFILE_STORAGE_KEY,JSON.stringify({
    system:systemEl?systemEl.value:'sayc',
    aiDifficulty,
    conventions,
    savedAt:new Date().toISOString()
  }));
  closeSystemProfile();
  openModeSelector();
}
function openModeSelector(){
  const overlay=el('modeOverlay');
  if(overlay) overlay.classList.add('show');
}
function closeModeSelector(){
  const overlay=el('modeOverlay');
  if(overlay) overlay.classList.remove('show');
}
function selectGameMode(mode){
  currentGameMode=mode;
  localStorage.setItem(MODE_STORAGE_KEY,mode);
  closeModeSelector();
  biddingPracticeMode=null;
  const isAI=mode==='ai_bridge';
  const online=el('onlineMode');
  if(online) online.classList.toggle('active',mode==='online_bidding');
  el('infoBar').style.display=isAI?'flex':'none';
  el('bidWrap').style.display=isAI?'grid':'none';
  el('playWrap').classList.remove('active');
  const contractInfo=el('contractInfo');
  if(contractInfo) contractInfo.classList.remove('active');
  if(isAI) startGame();
}
function startOnlineBiddingPractice(mode){
  biddingPracticeMode=mode;
  const online=el('onlineMode');
  if(online) online.classList.remove('active');
  startGame();
}
function bootApp(){
  loadSystemProfile(true);
  try{
    const profile=JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY)||'null');
    if(profile && profile.aiDifficulty) openModeSelector();
  }catch(e){
    openSystemProfile();
  }
}


/* ════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════ */
const el=id=>document.getElementById(id);
const dr=r=>r==='T'?'10':r;

// Competitive convention profile. Core SAYC remains the default; optional
// conventions can be enabled explicitly without changing the base system.
const CONVENTIONS = window.BRIDGE_CONVENTIONS || {
  michaels: false,
  unusual2NT: false,
  responsiveDouble: true,
  supportDouble: false,
  penaltyDoubles: true
};
function conventionEnabled(name){ return !!CONVENTIONS[name]; }

function bval(l,s){return l*10+SUIT_ORDER[s];}
function bstr(l,s){return s==='NT'?l+'NT':l+SUITS[s].sym;}
function safeBid(l,s){
  if(l<1||l>7) return null;
  if(!SUIT_ORDER[s]) return null;
  return bval(l,s)>lastBidVal?{bid:bstr(l,s)}:null;
}

// Kontur geçerlilik kontrolü — merkezi fonksiyon
// seat: kontur yapan, opp1/opp2: rakipler
function canDouble(seat){
  const partner=seat==='N'?'S':seat==='S'?'N':seat==='E'?'W':'E';
  const isNS=seat==='N'||seat==='S';
  const opp1=isNS?'E':'N', opp2=isNS?'W':'S';
  // Son gerçek bid (pas/X/XX hariç)
  const lastReal=[...history].reverse().find(h=>h.bid!=='PASS'&&h.bid!=='X'&&h.bid!=='XX');
  if(!lastReal) return false;
  // Son gerçek bid RAKIPTEN gelmeli (partner veya kendimizden değil)
  if(lastReal.seat===seat||lastReal.seat===partner) return false;
  // Son gerçek bidden bu yana zaten X veya XX var mı?
  const idx=history.indexOf(lastReal);
  const since=history.slice(idx+1);
  if(since.some(h=>h.bid==='X'||h.bid==='XX')) return false;
  return true;
}

// Surkontr geçerlilik kontrolü
function canRedouble(seat){
  const partner=seat==='N'?'S':seat==='S'?'N':seat==='E'?'W':'E';
  const isNS=seat==='N'||seat==='S';
  const opp1=isNS?'E':'N', opp2=isNS?'W':'S';
  // Son X bize veya partnerimize atılmış olmalı
  const lastX=[...history].reverse().find(h=>h.bid==='X');
  if(!lastX) return false;
  // X\u2019i yapan rakip olmalı
  if(lastX.seat!==opp1&&lastX.seat!==opp2) return false;
  // X\u2019ten bu yana XX var mı?
  const idx=history.indexOf(lastX);
  const since=history.slice(idx+1);
  if(since.some(h=>h.bid==='XX')) return false;
  return true;
}

function makeDeck(){let d=[];SK.forEach(s=>RANKS.forEach(r=>d.push({r,s})));return d.sort(()=>Math.random()-.5);}
function sortHand(h){h.sort((a,b)=>SUITS[b.s].val!==SUITS[a.s].val?SUITS[b.s].val-SUITS[a.s].val:RANKS.indexOf(a.r)-RANKS.indexOf(b.r));}
function stats(h){
  let hcp=0,cnt={S:0,H:0,D:0,C:0};
  h.forEach(c=>{hcp+=(HV[c.r]||0);cnt[c.s]++;});
  let dist=0;Object.values(cnt).forEach(n=>{if(n===0)dist+=3;else if(n===1)dist+=2;else if(n===2)dist+=1;});
  return{hcp,dist,total:hcp+dist,cnt};
}
function isBalanced(cnt){const d=Object.values(cnt).sort((a,b)=>b-a).join('-');return d==='4-3-3-3'||d==='4-4-3-2'||d==='5-3-3-2';}
function isBridgeBalanced(cnt){return isBalanced(cnt); }
function bidSuitKey(bid){const r=bid.slice(1);if(r==='NT')return'NT';return SK.find(s=>SUITS[s].sym===r)||'C';}

/* ════════════════════════════════════════════════════
   INIT GAME
════════════════════════════════════════════════════ */
function startGame(resetAll=false){
  if(resetAll){ dealerIdx=0; scoreNS=0; scoreEW=0; dealNumber=0; }
  forceRevealAll=false; // yeni elde inceleme modu sıfırlanır

  // Set vulnerability from table
  const vul = VUL_TABLE[dealNumber % VUL_TABLE.length];
  vulNS=vul.ns; vulEW=vul.ew;
  dealNumber++;

  // Current dealer
  const dealer = SEAT[dealerIdx % 4];

  history=[];lastBidVal=0;lastBidStr='';lastBidSeat=null;
  doubled=false;redoubled=false;passCount=0;gameOver=false;
  selLvl=null;selSuit=null;playActive=false;

  el('logBody').innerHTML='';
  el('anl').style.display='none';
  el('btnNew').style.display='none';
  el('ctrl').style.display='block';
  el('thinking').style.display='none';
  el('vCont').textContent='—';
  const online=el('onlineMode');if(online)online.classList.remove('active');
  el('infoBar').style.display='flex';
  el('bidWrap').style.display='grid';
  el('playWrap').classList.remove('active');
  el('scoreBar').classList.remove('active');
  document.getElementById('contractInfo').classList.remove('active');
  const bep=el('bidExplain');if(bep){bep.innerHTML='';bep.style.display='none';}
  const fb=document.getElementById('finishBar');if(fb)fb.remove();
  const pb2=document.getElementById('playBanner');if(pb2)pb2.style.display='none';

  const d=makeDeck();
  hands={N:d.slice(0,13),E:d.slice(13,26),S:d.slice(26,39),W:d.slice(39,52)};
  Object.keys(hands).forEach(p=>sortHand(hands[p]));

  // Show North stats (user=North)
  const st=stats(hands.N);
  el('vHcp').textContent=st.hcp;el('vDist').textContent=st.dist;el('vTotal').textContent=st.total;
  el('sHcp').textContent=st.hcp;el('sDist').textContent=st.dist;el('sTotal').textContent=st.total;

  buildCtrls();renderAll(false);refreshCtrls();
  updateInfoBar();

  // Rotate SEAT so dealer sits first
  // The global SEAT stays ['N','E','S','W'] but we rebuild deal order
  // currentSeat() uses history.length%4 from SEAT starting at dealer
  // We store dealerIdx and offset in currentSeat
  setTimeout(()=>{
    const first=currentSeat();
    if(first!=='N'){
      triggerAI(); // dealer is E/S/W — AI bids first until N\u2019s turn
    }
    // If dealer is N, user bids first — controls are ready
  }, 400);
}

/* ── INFO BAR UPDATE ── */
function updateInfoBar(){
  const dealer=SEAT[dealerIdx%4];
  const dname={N:'Kuzey',E:'Doğu',S:'Güney',W:'Batı'}[dealer];
  el('ibDeal').textContent='El: '+dealNumber;
  el('ibDealer').textContent='Dağıtıcı: '+dname+(dealer==='N'?' (Siz)':'');
  
  let vulText='Zone: ';
  let vulClass='none';
  if(vulNS&&vulEW){vulText+='İkisi de';vulClass='both';}
  else if(vulNS){vulText+='NS Zoneli';vulClass='ns';}
  else if(vulEW){vulText+='EW Zoneli';vulClass='ew';}
  else{vulText+='Yok';}
  const vb=el('ibVul');
  vb.textContent=vulText;
  vb.className='ib-vul '+vulClass;
  
  el('ibNS').textContent='NS: '+(scoreNS>=0?'+':'')+scoreNS;
  el('ibEW').textContent='EW: '+(scoreEW>=0?'+':'')+scoreEW;
}

/* ════════════════════════════════════════════════════
   BIDDING CONTROLS
════════════════════════════════════════════════════ */
function buildCtrls(){
  const lr=el('lvlRow');lr.innerHTML='';
  for(let i=1;i<=7;i++){const b=document.createElement('button');b.className='bl';b.id='bl'+i;b.textContent=i;b.onclick=()=>pickLvl(i);lr.appendChild(b);}
  const sr=el('suitRow');sr.innerHTML='';
  ['C','D','H','S','NT'].forEach(s=>{const b=document.createElement('button');b.className='bs'+(s==='H'||s==='D'?' red':'');b.id='bs'+s;b.innerHTML=s==='NT'?'NT':SUITS[s].sym;b.onclick=()=>pickSuit(s);sr.appendChild(b);});
}
function pickLvl(l){selLvl=l;selSuit=null;document.querySelectorAll('.bl').forEach(b=>b.classList.remove('on'));document.querySelectorAll('.bs').forEach(b=>b.classList.remove('on'));el('bl'+l).classList.add('on');refreshCtrls();}
function pickSuit(s){selSuit=s;document.querySelectorAll('.bs').forEach(b=>b.classList.remove('on'));el('bs'+s).classList.add('on');refreshCtrls();}

function refreshCtrls(){
  for(let i=1;i<=7;i++){const b=el('bl'+i);if(!b)continue;b.disabled=(i*10+5<=lastBidVal);b.classList.toggle('on',selLvl===i);}
  ['C','D','H','S','NT'].forEach(s=>{const b=el('bs'+s);if(!b)return;b.disabled=selLvl?bval(selLvl,s)<=lastBidVal:false;b.classList.toggle('on',selSuit===s);});
  el('btnBid').disabled=!(selLvl&&selSuit&&bval(selLvl,selSuit)>lastBidVal);

  // Kontur/Surkontr — merkezi validasyon kullan
  el('btnDbl').disabled=!(!gameOver&&canDouble('N'));
  el('btnRdbl').disabled=!(!gameOver&&canRedouble('N'));
}

/* ════════════════════════════════════════════════════
   TURN MANAGEMENT
════════════════════════════════════════════════════ */
function currentSeat(){
  // Dealer rotates: history[0] = dealer\u2019s first bid
  return SEAT[(dealerIdx + history.length) % 4];
}

function record(bid,seat,isX,isXX){
  if(bid==='PASS')passCount++;
  else if(isX){doubled=true;redoubled=false;passCount=0;}
  else if(isXX){redoubled=true;doubled=false;passCount=0;}
  else{passCount=0;lastBidVal=bval(parseInt(bid[0]),bidSuitKey(bid));lastBidStr=bid;lastBidSeat=seat;doubled=false;redoubled=false;}
  history.push({seat,bid,isX,isXX});
  renderLog();updateContractBar();
  // Deklerasyon açıklama paneli kaldırıldı
  const realBids=history.filter(h=>h.bid!=='PASS'&&h.bid!=='X'&&h.bid!=='XX');
  // Finish conditions:
  // 1. At least one real bid + 3 consecutive passes
  // 2. All 4 players passed (no bid)
  // 3. Safety: max 48 bids (prevents infinite loop)
  if((realBids.length>0&&passCount>=3)||
     (realBids.length===0&&history.length===4&&passCount===4)||
     history.length>=48){
    finish();return true;
  }
  selLvl=null;selSuit=null;refreshCtrls();return false;
}

/* ════════════════════════════════════════════════════
   USER BIDS
════════════════════════════════════════════════════ */
function doBid(){
  if(!selLvl||!selSuit) return;
  const seat=currentSeat();
  if(seat!=='N') return; // user is North
  if(record(bstr(selLvl,selSuit),'N',false,false)) return;
  triggerAI();
}
function doPass(){
  const seat=currentSeat();
  if(seat!=='N') return;
  const force=currentForceStatus('N');
  if(force){
    const ok=confirm('Partnerinizin bidi FORCING! Normalde pas geçilemez.\n\nYine de pas geçmek istiyor musunuz?');
    if(!ok) return;
  }
  if(record('PASS','N',false,false)) return;
  triggerAI();
}
function doDouble(){
  if(currentSeat()!=='N') return;
  if(!canDouble('N')){alert('Şu an kontr atamazsınız!');return;}
  if(record('X','N',true,false)) return;
  triggerAI();
}
function doRedouble(){
  if(currentSeat()!=='N') return;
  if(!canRedouble('N')){alert('Şu an surkontr atamazsınız!');return;}
  if(record('XX','N',false,true)) return;
  triggerAI();
}

function triggerAI(){if(gameOver)return;el('thinking').style.display='block';stepAI();}
function stepAI(){
  if(gameOver){el('thinking').style.display='none';return;}
  const seat=currentSeat();
  if(seat==='N'){el('thinking').style.display='none';refreshCtrls();return;}
  setTimeout(()=>{
    if(gameOver)return;
    try{
      const m=(biddingPracticeMode==='partner_only'&&(seat==='E'||seat==='W'))?{bid:'PASS'}:(getAIBid(seat)||{bid:'PASS'});
      if(record(m.bid,seat,m.isX||false,m.isXX||false))return;
      stepAI();
    }catch(e){
      console.error('stepAI error:',e.message);
      // Hata durumunda pas geç
      try{if(record('PASS',seat,false,false))return;stepAI();}catch(e2){}
    }
  },430);
}

/* ════════════════════════════════════════════════════
   AI BIDDING ENGINE — STANDARD AMERICAN 5-CARD MAJOR
════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════
   AI BIDDING ENGINE — STANDARD AMERICAN 5-CARD MAJOR
   Full multi-round auction logic
══════════════════════════════════════════════════════════════ */

// Helper: extract suit key ('S','H','D','C','NT') from a bid string
function suitOf(bid){
  if(!bid||bid==='PASS'||bid==='X'||bid==='XX') return null;
  const r=bid.slice(1);
  if(r==='NT') return 'NT';
  return SK.find(s=>SUITS[s].sym===r)||null;
}
// Helper: level of a bid string
function lvlOf(bid){return parseInt(bid)||0;}


/* ══════════════════════════════════════════════════════════════
   5-CARD MAJOR V2 — 1♠ AUCTION CORE
   Uncontested Standard American/SAYC-style logic.
   This layer is intentionally conservative and sits in front of
   the older heuristic engine; it does not replace the whole AI.
══════════════════════════════════════════════════════════════ */
function isCleanAuctionForSpadeCore(){
  return history.every(h=>h.bid==='PASS'||(!h.isX&&!h.isXX));
}
function realAuction(){
  return history.filter(h=>h.bid!=='PASS'&&!h.isX&&!h.isXX);
}
function bidObj(bid){return {bid};}

function fiveMajorSpadeCore(seat, st){
  // V2.1: 1♠ family, uncontested, SAYC-style ranges.
  // This core is deliberately narrow: it handles the first and second
  // rounds coherently and lets the legacy engine handle unsupported cases.
  if(!isCleanAuctionForSpadeCore()) return null;
  const a=realAuction();
  if(!a.length || a[0].bid!=='1♠') return null;
  const opener=a[0].seat, responder=partnerOf(opener);
  if(seat!==opener && seat!==responder) return null;
  // High-priority exact continuations for common minor auctions.
  if(a.length===4 && seat===opener && a[0].seat===seat &&
     (a[0].bid==='1♣'||a[0].bid==='1♦') && (a[1].bid==='1♥'||a[1].bid==='1♠') &&
     a[2].bid==='1NT' && a[3].bid===a[1].bid){
    const fs=suitOf(a[1].bid);
    if(cnt[fs]>=3 && hcp>=16) return sb(4,fs);
    if(cnt[fs]>=3 && hcp>=13) return sb(3,fs);
    if(balanced && hcp>=18) return sb(2,'NT');
    return {bid:'PASS'};
  }
  if(a.length===4 && seat===opener && a[0].seat===seat &&
     (a[0].bid==='1♣'||a[0].bid==='1♦') && lvlOf(a[1].bid)===2 &&
     lvlOf(a[2].bid)===2 && lvlOf(a[3].bid)===2){
    const os0=suitOf(a[0].bid), r0=suitOf(a[1].bid), o2=suitOf(a[2].bid), r3=suitOf(a[3].bid);
    const fourth=['C','D','H','S'].find(x=>![os0,r0,o2].includes(x));
    if(r3===fourth){
      if(o2 && o2!=='NT' && cnt[o2]>=3) return sb(3,o2);
      if(isBalanced(cnt) && cnt[r3]>=1 && hcp>=12) return sb(3,'NT');
      if(o2 && o2!=='NT' && cnt[o2]>=5) return sb(3,o2);
      if(hcp>=13) return sb(3,'NT');
      return {bid:'PASS'};
    }
  }

  const {hcp,cnt}=st, balanced=isBalanced(cnt), sb=(l,s)=>safeBid(l,s);
  if(!a.length) return null;

  // ---------- OPENER: 1♠ - response - rebid ----------
  if(seat===opener && a.length===2 && a[0].seat===opener && a[1].seat===responder){
    const r=a[1].bid, rs=suitOf(r), rl=lvlOf(r);

    // 1♠-1NT: forcing NT. SAYC-style: 13-18 new suit at 2-level,
    // 13-15 six spades -> 2♠, 18-19 balanced -> 2NT,
    // 16-18 six spades -> 3♠, 19+ jump new suit.
    if(r==='1NT'){
      if(balanced && hcp>=18 && hcp<=19) return sb(2,'NT');
      if(cnt.S>=6 && hcp>=16 && hcp<=18) return sb(3,'S');
      if(cnt.S>=6 && hcp>=13 && hcp<=15) return sb(2,'S');
      if(hcp>=19){
        if(cnt.H>=4) return sb(3,'H');
        if(cnt.D>=4) return sb(3,'D');
        if(cnt.C>=4) return sb(3,'C');
        if(balanced) return sb(3,'NT');
      }
      if(cnt.H>=4) return sb(2,'H');
      if(cnt.D>=4) return sb(2,'D');
      if(cnt.C>=4) return sb(2,'C');
      if(cnt.S>=5) return sb(2,'S');
      return null;
    }

    // 1♠-2♣/2♦/2♥: 2/1 response. In SAYC this is forcing one round;
    // opener shows a second suit, six-card spades, or a balanced NT hand.
    if(rl===2 && (rs==='C'||rs==='D'||rs==='H')){
      // 18-19 balanced: 3NT after a 2/1 response.
      if(balanced && hcp>=18 && hcp<=19) return sb(3,'NT');
      // 19+ jump-shift in a new suit (game-forcing).
      if(hcp>=19){
        if(rs!=='H' && cnt.H>=4) return sb(3,'H');
        if(rs!=='D' && cnt.D>=4) return sb(3,'D');
        if(rs!=='C' && cnt.C>=4) return sb(3,'C');
      }
      // Show a 4+ second suit at the 2-level with 13-18.
      if(hcp>=13 && hcp<=18){
        if(rs!=='H' && cnt.H>=4) return sb(2,'H');
        if(rs!=='D' && cnt.D>=4) return sb(2,'D');
        if(rs!=='C' && cnt.C>=4) return sb(2,'C');
      }
      // Rebid 6+ spades when no better second-suit/NT description exists.
      if(cnt.S>=6 && hcp>=16 && hcp<=18) return sb(3,'S');
      if(cnt.S>=6 && hcp>=13 && hcp<=15) return sb(2,'S');
      if(balanced && hcp>=13 && hcp<=14) return sb(2,'NT');
      return null;
    }

    // 1♠-2♠: 3+ support, 13-15 simple raise; 16-18 jump raise;
    // 19-22 game. Minimum opener passes.
    if(r==='2♠'){
      if(hcp>=19) return sb(4,'S');
      if(hcp>=16) return sb(3,'S');
      return {bid:'PASS'};
    }

    // 1♠-3♠: invitational/limit raise -> opener accepts with 16+.
    if(r==='3♠'){
      if(hcp>=16) return sb(4,'S');
      return {bid:'PASS'};
    }
  }

  // ---------- RESPONDER: first rebid after opener ----------
  if(seat===responder && a.length===3 && a[0].seat===opener &&
     a[1].seat===responder && a[2].seat===opener){
    const r=a[1].bid, rebid=a[2].bid, rs=suitOf(r), ps=suitOf(rebid), pr=lvlOf(rebid);

    // 1♠-1NT-2♠: opener shows 6 spades. Responder: 6-8 pass,
    // 9-10 invite 3♠, 11+ game.
    if(r==='1NT' && ps==='S' && pr===2){
      if(hcp>=11) return sb(4,'S');
      if(hcp>=9) return sb(3,'S');
      return {bid:'PASS'};
    }
    // 1♠-1NT-2NT: opener 18-19. 8+ usually game; 6-7 pass.
    if(r==='1NT' && ps==='NT' && pr===2){
      if(hcp>=7) return sb(3,'NT');
      return {bid:'PASS'};
    }
    // 1♠-1NT-2H/2D/2C: support opener's second suit or choose NT.
    if(r==='1NT' && (ps==='H'||ps==='D'||ps==='C') && pr===2){
      if((ps==='H'||ps==='S') && cnt[ps]>=4 && hcp>=13) return sb(4,ps);
      if(cnt[ps]>=4 && hcp>=10) return sb(3,ps);
      if(hcp>=10) return sb(3,'NT');
      if(cnt[ps]>=3) return sb(2,ps);
      return {bid:'PASS'};
    }

    // 2/1 auctions: responder must continue unless opener has reached game.
    if((rs==='C'||rs==='D'||rs==='H') && lvlOf(r)===2){
      // Opener rebid our 2/1 suit: support/NT/game according to strength.
      if(ps===rs){
        if(rs==='H' || rs==='C' || rs==='D'){
          if(hcp>=13) return sb(4,rs==='C'||rs==='D'? 'NT':rs);
          if(hcp>=11) return sb(3,rs);
          return {bid:'PASS'};
        }
      }
      // Opener rebid spades: 3-card support can be shown; with 5+ and 11+ game.
      if(ps==='S'){
        if(cnt.S>=5 && hcp>=11) return sb(4,'S');
        if(cnt.S>=3 && hcp>=11) return sb(3,'S');
        if(cnt.S>=3) return sb(2,'S');
      }
      // Opener showed a new second suit: preference or fourth-suit enquiry.
      if((ps==='H'||ps==='D'||ps==='C') && ps!==rs){
        // After 1♠-2/1, rebid a 5-card spade suit before defaulting to NT.
        if(cnt.S>=5) return sb(2,'S');
        if(cnt[ps]>=4 && hcp>=11) return sb(3,ps);
        if(cnt[rs]>=5 && hcp>=11) return sb(3,rs);
        if(hcp>=12) return sb(3,'NT');
        if(cnt[rs]>=5) return sb(2,rs);
        return {bid:'PASS'};
      }
      // Opener 2NT after 2/1: natural minimum (12-14). Continue to 3NT with enough values.
      if(ps==='NT' && pr===2){
        if(hcp>=12) return sb(3,'NT');
        return {bid:'PASS'};
      }
      // Opener 3NT after 2/1: game reached.
      if(ps==='NT' && pr===3) return {bid:'PASS'};
    }
  }

  // ---------- V2.5 CONTINUATIONS: 3rd/4th round ----------
  // Keep the auction meaning alive instead of falling straight through to
  // the generic HCP target engine. This block is intentionally SAYC-based.
  if(a.length>=4){
    const b1=a[0].bid, b2=a[1].bid, b3=a[2].bid, b4=a[3].bid;
    const s2=suitOf(b2), s3=suitOf(b3), s4=suitOf(b4);
    const l2=lvlOf(b2), l3=lvlOf(b3), l4=lvlOf(b4);

    // 1S-1NT-2S-... : six-card spade rebid.
    if(b1==='1♠' && b2==='1NT' && b3==='2♠' && seat===responder){
      if(hcp>=11) return sb(4,'S');
      if(hcp>=9) return sb(3,'S');
      return {bid:'PASS'};
    }

    // 1S-1NT-2NT-... : opener's 18-19 balanced rebid.
    if(b1==='1♠' && b2==='1NT' && b3==='2NT' && seat===responder){
      if(hcp>=8) return sb(3,'NT');
      return {bid:'PASS'};
    }

    // 1S-1NT-2H/2D/2C. Responder now either supports the shown suit,
    // chooses NT, or signs off. A jump in a new suit is GF and is handled
    // conservatively as a forcing continuation.
    if(b1==='1♠' && b2==='1NT' && l3===2 && ['H','D','C'].includes(s3) && seat===responder){
      if((s3==='H'||s3==='D'||s3==='C') && cnt[s3]>=4){
        if(hcp>=13) return sb(4,s3);
        if(hcp>=10) return sb(3,s3);
        return sb(2,s3);
      }
      if(hcp>=10) return sb(3,'NT');
      return {bid:'PASS'};
    }

    // 1S-2/1-2(second suit)-... responder's second bid.
    if(b1==='1♠' && l2===2 && ['C','D','H'].includes(s2) && seat===responder){
      // 4th suit: artificial, forcing one round. Only choose it when it is
      // genuinely the fourth suit and we do not have a cleaner fit/game bid.
      const four = ['C','D','H','S'].find(x=>![s2,s3].includes(x));
      if(l4===2 && s4===four && four!=='S'){
        if(hcp>=13 && cnt.S>=3) return sb(3,'S');
        return safeBid(2,four)||{bid:'PASS'};
      }
      // If opener rebid a different second suit, preference/fit first;
      // a 3-level new suit is a game-forcing continuation.
      if(s3 && s3!=='NT' && s3!==s2){
        if(cnt.S>=3 && hcp>=11) return sb(3,'S');
        if(cnt[s3]>=4 && hcp>=11) return sb(3,s3);
        if(cnt[s2]>=5 && hcp>=11) return sb(3,s2);
        if(hcp>=12) return sb(3,'NT');
        if(cnt[s2]>=5) return sb(2,s2);
        return {bid:'PASS'};
      }
      // Opener rebid our 2/1 suit: continue naturally; no false pass in a
      // one-round-forcing auction unless game is already reached.
      if(s3===s2){
        if(s2==='H' && cnt.H>=5 && hcp>=11) return sb(4,'H');
        if((s2==='C'||s2==='D') && hcp>=13) return sb(3,'NT');
        if(hcp>=11) return sb(3,s2);
        if(cnt.S>=3) return sb(2,'S');
        return {bid:'PASS'};
      }
    }

    // 1S-2/1-2D/2H-2(4th suit): opener answers the 4SF enquiry.
    if(b1==='1♠' && l2===2 && ['C','D','H'].includes(s2) && seat===opener && a.length===5){
      const r4=suitOf(b4), r4lvl=lvlOf(b4);
      const is4SF = r4lvl===2 && r4 && ![s2,s3,'S'].includes(r4);
      if(is4SF){
        // Show 3-card spade support first; otherwise NT stopper; otherwise
        // rebid the real long second suit. This preserves the enquiry.
        if(cnt.S>=3) return sb(3,'S');
        if(cnt[r4]>=1 && isBalanced(cnt) && hcp>=12) return sb(2,'NT');
        if(s3 && s3!=='NT' && cnt[s3]>=5) return sb(3,s3);
        if(hcp>=13) return sb(3,'NT');
        return sb(3,s2)||{bid:'PASS'};
      }
    }

    // 1S-2S-3S-... and 1S-3S-... : responder/opener game decisions.
    if(b1==='1♠' && b2==='2♠' && b3==='3♠'){
      if(seat===responder){
        if(hcp>=12) return sb(4,'S');
        return {bid:'PASS'};
      }
    }
    if(b1==='1♠' && b2==='3♠' && seat===responder){
      if(hcp>=11) return sb(4,'S');
      return {bid:'PASS'};
    }
  }

  // Keep this core out of later auctions until those continuations are
  // explicitly encoded; the legacy engine remains the fallback.
  return null;
}


/* ══════════════════════════════════════════════════════════════
   5-CARD MAJOR V2 — 1♥ AUCTION CORE
   SAYC/Standard American, uncontested. Mirrors the 1♠ core while
   preserving the special 1♥-1♠ natural one-level response.
══════════════════════════════════════════════════════════════ */
function fiveMajorHeartCore(seat, st){
  if(!isCleanAuctionForSpadeCore()) return null;
  const a=realAuction();
  if(!a.length || a[0].bid!=='1♥') return null;
  const opener=a[0].seat, responder=partnerOf(opener);
  if(seat!==opener && seat!==responder) return null;
  const {hcp,cnt}=st, balanced=isBalanced(cnt), sb=(l,s)=>safeBid(l,s);

  // Opener's first rebid
  if(seat===opener && a.length===2 && a[1].seat===responder){
    const r=a[1].bid, rs=suitOf(r), rl=lvlOf(r);
    // 1♥-1♠: natural one-level response; opener shows shape/strength.
    if(r==='1♠'){
      if(cnt.S>=4 && cnt.H>=5 && hcp>=13) return sb(2,'S');
      if(balanced && hcp>=20 && hcp<=21) return sb(3,'NT');
      if(balanced && hcp>=18 && hcp<=19) return sb(2,'NT');
      if(cnt.H>=6 && hcp>=16 && hcp<=18) return sb(3,'H');
      if(cnt.H>=6 && hcp>=13 && hcp<=15) return sb(2,'H');
      if(cnt.S>=4) return hcp>=15?sb(2,'S'):sb(1,'NT');
      if(cnt.D>=4) return sb(2,'D');
      if(cnt.C>=4) return sb(2,'C');
      if(balanced) return sb(1,'NT');
      return null;
    }
    // 1♥-1NT: forcing NT in this implementation.
    if(r==='1NT'){
      if(balanced && hcp>=18 && hcp<=19) return sb(2,'NT');
      if(cnt.H>=6 && hcp>=16 && hcp<=18) return sb(3,'H');
      if(cnt.H>=6 && hcp>=13 && hcp<=15) return sb(2,'H');
      if(hcp>=19){
        if(cnt.S>=4) return sb(3,'S');
        if(cnt.D>=4) return sb(3,'D');
        if(cnt.C>=4) return sb(3,'C');
        if(balanced) return sb(3,'NT');
      }
      if(cnt.S>=4) return sb(2,'S');
      if(cnt.D>=4) return sb(2,'D');
      if(cnt.C>=4) return sb(2,'C');
      if(cnt.H>=5) return sb(2,'H');
      return null;
    }
    // 1♥-2♣/2♦/2♠: 2/1 one-round forcing in the selected SAYC profile.
    if(rl===2 && ['C','D','S'].includes(rs)){
      if(balanced && hcp>=18 && hcp<=19) return sb(3,'NT');
      // Reverse rebids at the two-level require extra strength.
      // In particular, 1♥-2♣-2♠ is a reverse, not a routine 4-card suit rebid.
      if(hcp>=17 && cnt.H>=5 && cnt.S>=4 && rs!=='S') return sb(2,'S');
      if(hcp>=19){
        if(rs!=='S' && cnt.S>=4) return sb(3,'S');
        if(rs!=='D' && cnt.D>=4) return sb(3,'D');
        if(rs!=='C' && cnt.C>=4) return sb(3,'C');
      }
      if(hcp>=13 && hcp<=18){
        // Show a lower-ranking natural second suit before a reverse.
        if(rs!=='D' && cnt.D>=4) return sb(2,'D');
        if(rs!=='C' && cnt.C>=4) return sb(2,'C');
      }
      if(cnt.H>=6 && hcp>=16) return sb(3,'H');
      if(cnt.H>=6 && hcp>=13) return sb(2,'H');
      if(balanced && hcp>=13 && hcp<=14) return sb(2,'NT');
      return null;
    }
    // Raises of hearts.
    if(r==='2♥'){
      if(hcp>=19) return sb(4,'H');
      if(hcp>=16) return sb(3,'H');
      return {bid:'PASS'};
    }
    if(r==='3♥'){
      if(hcp>=16) return sb(4,'H');
      return {bid:'PASS'};
    }
  }

  // Responder's second bid after opener rebid.
  if(seat===responder && a.length===3 && a[2].seat===opener){
    const r=a[1].bid, rebid=a[2].bid, rs=suitOf(r), ps=suitOf(rebid), pr=lvlOf(rebid);
    if(r==='1♠' && ps==='H' && pr===2){
      if(hcp>=11) return sb(4,'H');
      if(hcp>=9) return sb(3,'H');
      return {bid:'PASS'};
    }
    if(r==='1♠' && ps==='NT' && pr===1){
      if(hcp>=11) return sb(3,'NT');
      if(hcp>=9) return sb(2,'NT');
      return {bid:'PASS'};
    }
    if(r==='1NT' && ps==='H' && pr===2){
      if(hcp>=11) return sb(4,'H');
      if(hcp>=9) return sb(3,'H');
      return {bid:'PASS'};
    }
    if(r==='1NT' && ps==='NT' && pr===2){
      if(hcp>=7) return sb(3,'NT');
      return {bid:'PASS'};
    }
    if(['C','D','S'].includes(rs) && lvlOf(r)===2){
      if(ps===rs){
        if(rs==='S' && cnt.S>=5 && hcp>=11) return sb(4,'S');
        if(rs==='S' && cnt.S>=3 && hcp>=11) return sb(3,'S');
        if((rs==='C'||rs==='D') && hcp>=13) return sb(3,'NT');
        if(hcp>=11) return sb(3,rs);
        return {bid:'PASS'};
      }
      if(ps==='H'){
        if(cnt.H>=3 && hcp>=11) return sb(4,'H');
        if(cnt.H>=3) return sb(3,'H');
      }
      if(ps==='S' && cnt.S>=3 && hcp>=11) return sb(3,'S');
      if(cnt.S>=5) return sb(2,'S');
      if(hcp>=12) return sb(3,'NT');
      if(cnt[rs]>=5) return sb(3,rs);
      return {bid:'PASS'};
    }
  }

  // 3rd/4th round context for 1♥.
  if(a.length>=4){
    const b1=a[0].bid,b2=a[1].bid,b3=a[2].bid,b4=a[3].bid;
    const s2=suitOf(b2),s3=suitOf(b3),s4=suitOf(b4);
    const l2=lvlOf(b2),l3=lvlOf(b3),l4=lvlOf(b4);

    // 1♥-1♠-2♥ continuations.
    if(b1==='1♥'&&b2==='1♠'&&b3==='2♥'&&seat===responder){
      if(hcp>=11) return sb(4,'H');
      if(hcp>=9) return sb(3,'H');
      return {bid:'PASS'};
    }
    // 1♥-1NT-2♥ continuations.
    if(b1==='1♥'&&b2==='1NT'&&b3==='2♥'&&seat===responder){
      if(hcp>=11) return sb(4,'H');
      if(hcp>=9) return sb(3,'H');
      return {bid:'PASS'};
    }
    // 1♥-1♠-2D/2C: responder can preference hearts, support opener's second suit,
    // or make a forcing 3-level new-suit/NT continuation.
    if(b1==='1♥'&&b2==='1♠'&&l3===2&&['C','D'].includes(s3)&&seat===responder){
      if(cnt.H>=3&&hcp>=11) return sb(3,'H');
      if(cnt[s3]>=4&&hcp>=10) return sb(3,s3);
      if(hcp>=10) return sb(3,'NT');
      if(cnt.H>=3) return sb(2,'H');
      return {bid:'PASS'};
    }
    // 1♥-2♣-2♦-2♠-3♥: responder's next action after 4SF answer.
    if(b1==='1♥'&&b2==='2♣'&&b3==='2♦'&&b4==='2♠'&&seat===responder&&a.length===5){
      // 3♥ establishes the heart fit; with game values sign off in 4♥.
      if(cnt.H>=3 && hcp>=13) return sb(4,'H');
      if(isBalanced(cnt)&&hcp>=12) return sb(3,'NT');
      // After opener's 3♥ response to 4SF, the fit is established;
      // below game values the responder may pass rather than repeat 3♥.
      return {bid:'PASS'};
    }
    // 1♥-2/1-second suit-X: fourth suit enquiry by responder.
    if(b1==='1♥'&&l2===2&&['C','D','S'].includes(s2)&&seat===responder){
      const four=['C','D','S','H'].find(x=>![s2,s3].includes(x));
      if(l4===2&&s4===four&&four!=='H'){
        if(hcp>=13&&cnt.H>=3) return sb(3,'H');
        return sb(2,four)||{bid:'PASS'};
      }
    }
    // Opener's answer to 4SF: support responder's major, show stopper/NT,
    // or repeat the real second suit.
    if(b1==='1♥'&&l2===2&&['C','D','S'].includes(s2)&&seat===opener&&a.length===4){
      const r4=suitOf(b4),r4lvl=lvlOf(b4);
      const is4SF=r4lvl===2&&r4&&!['H',s2,s3].includes(r4);
      if(is4SF){
        if(cnt[r4]>=1&&hcp>=12&&isBalanced(cnt)) return sb(3,'NT');
        if(cnt.H>=3&&hcp>=12) return sb(3,'H');
        if(s3&&s3!=='NT'&&cnt[s3]>=5) return sb(3,s3);
        if(hcp>=13) return sb(3,'NT');
        return sb(3,s2)||{bid:'PASS'};
      }
    }
    // 1♥-1♠-2♥-3♥: responder's next action.
    if(b1==='1♥'&&b2==='1♠'&&b3==='2♥'&&b4==='3♥'&&seat===responder&&a.length===5){
      if(cnt.H>=3&&hcp>=13) return sb(4,'H');
      if(hcp>=12&&isBalanced(cnt)) return sb(3,'NT');
      return {bid:'PASS'};
    }
    // Simple heart-fit progression.
    if(b1==='1♥'&&b2==='2♥'&&b3==='3♥'&&seat===responder){
      if(hcp>=12) return sb(4,'H');
      return {bid:'PASS'};
    }
    if(b1==='1♥'&&b2==='3♥'&&seat===responder){
      if(hcp>=11) return sb(4,'H');
      return {bid:'PASS'};
    }
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════
   FORCING BID SİSTEMİ
   Partner'ın forcing (devam zorunlu) bidinden sonra pas geçilemez.
   Kapsanan durumlar: Jump shift (opener rebid), 2/1 yeni renk,
   Cue bid, 4. renk forcing, Negative/Takeout double.
══════════════════════════════════════════════════════════════ */

function partnerOf(seat){return seat==='N'?'S':seat==='S'?'N':seat==='E'?'W':'E';}
function isNSseat(seat){return seat==='N'||seat==='S';}

// seat, verilen rengi auction boyunca kaç KEZ bidledi? (açılış dahil)
function suitBidCount(seat, suit){
  return history.filter(h=>h.seat===seat&&h.bid!=='PASS'&&!h.isX&&!h.isXX&&suitOf(h.bid)===suit).length;
}

// GÜVENLİ RENK TIRMANDIRMA: partner hiç fit göstermediyse aynı rengi
// sonsuza kadar yükseltmeyi ENGELLER. En fazla 2 kez tekrar edilebilir,
// ve sadece gerçek HCP artışı varsa (mekanik "6 kart var" yetmez).
function safeSuitRebid(seat, st, suit, myLvl, combined){
  if(!suit||suit==='NT') return null;
  const already=suitBidCount(seat,suit);
  if(already>=3) return null; // 3. kez söylendiyse dur — partner istemiyor demektir
  // Combined güç gerçekten oyun/slam bölgesine işaret etmiyorsa daha fazla yükselme
  if(combined && combined.min<20 && myLvl>=3) return null;
  const nextLvl=myLvl+1;
  if(nextLvl>7) return null;
  return safeBid(nextLvl,suit);
}

// seat'in şu an forcing bir duruma karşı bid vermesi mi gerekiyor?
// Döner: null (forcing yok) | 'round' (bu tur pas yasak) | 'game' (oyuna kadar pas yasak)
function currentForceStatus(seat){
  const partner=partnerOf(seat);
  const pBids=history.filter(x=>x.seat===partner&&x.bid!=='PASS'&&!x.isX&&!x.isXX);
  if(!pBids.length) return null;
  const pLast=pBids[pBids.length-1];
  const pLastIdx=history.indexOf(pLast);

  // seat bu partner bidinden SONRA zaten gerçek bir bid yaptı mı? (forcing tek tur ise tatmin olmuş)
  const respondedSince=history.slice(pLastIdx+1).some(h=>h.seat===seat&&h.bid!=='PASS'&&!h.isX&&!h.isXX);

  const pBid=pLast.bid, pSuit=suitOf(pBid), pLvl=lvlOf(pBid);
  const priorH=history.slice(0,pLastIdx);
  const partnerPriorBids=priorH.filter(x=>x.seat===partner&&x.bid!=='PASS'&&!x.isX&&!x.isXX);
  const seatPriorBids=priorH.filter(x=>x.seat===seat&&x.bid!=='PASS'&&!x.isX&&!x.isXX);

  // ── Negative/Takeout Double (X) — round forcing ───────────
  // Partner'ın en son AKSİYONU (real bid değil) X ise ve henüz cevaplanmadıysa
  const lastPartnerAction=[...history].reverse().find(h=>h.seat===partner);
  if(lastPartnerAction && lastPartnerAction.isX && !respondedSince){
    const idx2=history.indexOf(lastPartnerAction);
    const alreadyPassed=history.slice(idx2+1).some(h=>h.seat===seat&&h.bid==='PASS');
    if(!alreadyPassed) return 'round';
  }

  if(respondedSince) return null; // real bid ile zaten cevaplanmış

  // ── Cue bid: partner rakibin rengini bidledi → game force ──
  const oppSeats=isNSseat(seat)?['E','W']:['N','S'];
  if(pSuit&&pSuit!=='NT'){
    const oppBidThisSuit=priorH.some(h=>oppSeats.includes(h.seat)&&h.bid!=='PASS'&&!h.isX&&!h.isXX&&suitOf(h.bid)===pSuit);
    if(oppBidThisSuit) return 'game';
  }

  // ── Jump shift (opener rebid): partner'ın 2. bidi, yeni renk, seviye atlamalı ──
  if(partnerPriorBids.length===1 && seatPriorBids.length>=1){
    const respBid=seatPriorBids[seatPriorBids.length-1];
    const respSuit=suitOf(respBid.bid), respLvl=lvlOf(respBid.bid);
    if(pSuit&&pSuit!=='NT'&&pSuit!==suitOf(partnerPriorBids[0].bid)&&pSuit!==respSuit){
      let cheapestLvl=respLvl;
      while(bval(cheapestLvl,pSuit)<=bval(respLvl,respSuit)) cheapestLvl++;
      if(pLvl>cheapestLvl) return 'game'; // jump shift
    }
  }

  // ── 2/1 yeni renk cevabı: forcing bir tur ─────────────────
  if(partnerPriorBids.length===0&&seatPriorBids.length===0){
    const myOpen=history.slice(0,pLastIdx).find(h=>h.seat===seat&&h.bid!=='PASS'&&!h.isX&&!h.isXX);
    if(myOpen){
      const myOpenLvl=lvlOf(myOpen.bid), myOpenSuit=suitOf(myOpen.bid);
      if(pLvl===2&&pSuit&&pSuit!=='NT'&&pSuit!==myOpenSuit&&myOpenLvl===1){
        return 'round';
      }
    }
  }

  // ── 4. Renk Forcing: 3 renk bidlenmiş, 4.sü yeni ──────────
  const suitsBid=new Set(priorH.filter(h=>h.bid!=='PASS'&&!h.isX&&!h.isXX).map(h=>suitOf(h.bid)).filter(s=>s&&s!=='NT'));
  if(pSuit&&pSuit!=='NT'&&!suitsBid.has(pSuit)&&suitsBid.size===3){
    return 'game';
  }

  return null;
}

// Forcing durumda ASLA pas geçilemez — ama sonsuz tırmanma da YASAK.
// Aynı rengi en fazla 2 kez tekrar eder, sonra NT'ye veya pasa döner.
function forcedContinuation(seat, st, agreedGuess, combined){
  const{cnt,hcp}=st;
  const sb=(l,s)=>safeBid(l,s);
  // 1. Fit varsa (3+ kart) agreed rengi — ama en fazla 2 kez tekrarla
  if(agreedGuess&&agreedGuess!=='NT'&&cnt[agreedGuess]>=3&&suitBidCount(seat,agreedGuess)<3){
    for(let l=1;l<=7;l++){const b=sb(l,agreedGuess);if(b)return b;}
  }
  // 2. En uzun rengimi (4+) rebid et — ama sadece 2 tekrara kadar
  const bySuitLen=SK.map(s=>({s,n:cnt[s]||0})).sort((a,b)=>b.n-a.n);
  for(const{s,n} of bySuitLen){
    if(n>=4 && suitBidCount(seat,s)<3){
      for(let l=1;l<=7;l++){const b=sb(l,s);if(b)return b;}
    }
  }
  // 3. NT en ucuz seviyede (henüz denenmediyse)
  if(suitBidCount(seat,'NT')<2){
    for(let l=1;l<=7;l++){const b=sb(l,'NT');if(b)return b;}
  }
  // 4. Artık hiçbir renk mantıklı değil — forcing teorik olarak bitmiş sayılır, PAS
  return{bid:'PASS'};
}

function fiveMajorMinorCore(seat, st){
  // V2.9 — complete uncontested 1♣/1♦ SAYC-style family.
  // This layer handles opening, first rebid, responder's second bid and
  // the most important 3rd/4th-round continuations.  Competitive auctions
  // intentionally fall through to the competitive engine.
  if(!isCleanAuctionForSpadeCore()) return null;
  const a=realAuction();
  if(!a.length || !['1♣','1♦'].includes(a[0].bid)) return null;
  const opener=a[0].seat, responder=partnerOf(opener);
  if(seat!==opener && seat!==responder) return null;
  const {hcp,cnt}=st, sb=(l,s)=>safeBid(l,s), balanced=isBalanced(cnt);
  const b=(i)=>a[i]||null, bid=(i)=>b(i)?.bid, suit=(i)=>suitOf(bid(i)), lvl=(i)=>lvlOf(bid(i));
  const opening=bid(0), os=suit(0);
  const response=bid(1), rs=suit(1), rl=lvl(1);

  // ---------- OPENER: 1m - response ----------
  if(seat===opener && a.length===2){
    // 1m-1NT: 12-14 balanced; with 15-17 balanced, 1NT would have been opened.
    if(response==='1NT'){
      // 1m-1NT is non-forcing: a balanced minimum opener passes.
      // 18-19 balanced rebids 2NT; stronger shapes continue naturally.
      if(balanced && hcp>=12 && hcp<=14) return {bid:'PASS'};
      if(hcp>=18 && hcp<=19 && balanced) return sb(2,'NT');
      // 5+ minor rebid, otherwise natural second suit.
      if(cnt[os]>=6) return sb(2,os);
      const otherMinor=os==='C'?'D':'C';
      if(cnt[otherMinor]>=4 && hcp>=12) return sb(2,otherMinor);
      if(cnt.H>=4) return sb(1,'H');
      if(cnt.S>=4) return sb(1,'S');
      if(cnt[os]>=5) return sb(2,os);
      return null;
    }

    // 1m-1H/1S: show a four-card major at the one level first.
    if(rl===1 && (rs==='H'||rs==='S')){
      if(cnt.H>=4 && rs!=='H') return sb(1,'H');
      if(cnt.S>=4 && rs!=='S') return sb(1,'S');
      if(rs==='H' && cnt.H>=4) return sb(2,'H');
      if(rs==='S' && cnt.S>=4) return sb(2,'S');
      if(balanced && hcp>=12 && hcp<=14) return sb(1,'NT');
      if(cnt[os]>=6) return sb(2,os);
      const otherMinor=os==='C'?'D':'C';
      if(cnt[otherMinor]>=4 && hcp>=12) return sb(2,otherMinor);
      return null;
    }

    // 1C-1D: natural one-level response.  1D opener has no 1D response.
    if(opening==='1♣' && response==='1♦'){
      if(cnt.H>=4) return sb(1,'H');
      if(cnt.S>=4) return sb(1,'S');
      if(balanced && hcp>=12&&hcp<=14) return sb(1,'NT');
      if(cnt.C>=5) return sb(2,'C');
      if(cnt.D>=4&&hcp>=12) return sb(2,'D');
      return null;
    }

    // 2/1 response over a minor: opener shows natural second suit,
    // 6-card minor, or strong NT shape.  No false jump-shifts on 18-19.
    if(rl===2 && ['C','D','H','S'].includes(rs) && rs!==os){
      if(balanced && hcp>=18&&hcp<=19) return sb(3,'NT');
      if(hcp>=19){
        if(rs!=='H'&&cnt.H>=4) return sb(3,'H');
        if(rs!=='S'&&cnt.S>=4) return sb(3,'S');
        const om=os==='C'?'D':'C';
        if(rs!==om&&cnt[om]>=4) return sb(3,om);
      }
      if(cnt.H>=4 && rs!=='H') return sb(2,'H');
      if(cnt.S>=4 && rs!=='S') return sb(2,'S');
      if(cnt[os]>=6) return sb(3,os);
      const om=os==='C'?'D':'C';
      if(cnt[om]>=4 && hcp>=12) return sb(2,om);
      if(balanced&&hcp>=12&&hcp<=14) return sb(2,'NT');
      return null;
    }

    // Simple minor raise.
    if(rs===os && rl===2){
      if(hcp>=17) return sb(3,os); // invitational/stronger
      return {bid:'PASS'};
    }
    if(rs===os && rl===3){
      if(hcp>=15) return sb(5,os);
      if(hcp>=12) return sb(3,'NT');
      return {bid:'PASS'};
    }
  }

  // ---------- RESPONDER: second bid after opener rebid ----------
  if(seat===responder && a.length===3){
    const r2=bid(1), oreb=bid(2), r2s=suit(1), oS=suit(2), oL=lvl(2);
    // Major fit after opener raises responder's major.
    if((r2s==='H'||r2s==='S') && oS===r2s){
      if(hcp>=13) return sb(4,r2s);
      if(hcp>=10) return sb(3,r2s);
      return {bid:'PASS'};
    }
    // 1m-1M-1NT: responder rebids 5+ major naturally or invites/game in NT.
    if(r2s && (r2s==='H'||r2s==='S') && oS==='NT' && oL===1){
      if(cnt[r2s]>=6 && hcp>=8) return sb(4,r2s);
      if(cnt[r2s]>=5 && hcp>=10) return sb(2,r2s);
      if(hcp>=11) return sb(2,'NT');
      return {bid:'PASS'};
    }
    // 1m-1M-2m: preference/raise; 3m is invitational, 5m is rare and not automatic.
    if(oS===os && oL===2){
      if(cnt[os]>=5 && hcp>=11) return sb(3,os);
      if(cnt[os]>=5) return sb(2,os);
      if(cnt[r2s]>=5 && hcp>=10) return sb(2,r2s);
      return {bid:'PASS'};
    }
    // Opener showed a new suit.  4th suit forcing when responder bids the fourth suit.
    if(oS && oS!=='NT' && r2s!==oS){
      const known=new Set([os,r2s,oS]);
      const fourth=['C','D','H','S'].find(x=>!known.has(x));
      if(fourth && cnt[fourth]>=4 && hcp>=10) return sb(2,fourth);
      // support opener's second suit
      if((oS==='H'||oS==='S') && cnt[oS]>=3){
        if(hcp>=12) return sb(4,suit(2));
        if(hcp>=10) return sb(3,suit(2));
        return sb(2,oS);
      }
      if(cnt[r2s]>=5 && hcp>=10) return sb(3,r2s);
      if(hcp>=12 && balanced) return sb(2,'NT');
      return {bid:'PASS'};
    }
    // 1m-1M-2NT: invite/game.
    if(suit(2)==='NT'&&lvl(2)===2){
      if(hcp>=9) return sb(3,'NT');
      if(cnt[r2s]>=5&&hcp>=8) return sb(3,r2s);
      return {bid:'PASS'};
    }
    // 2/1 response: continue; new 3-level suit is GF, 3NT game.
    if(lvl(1)===2){
      if(suit(2)==='NT'&&lvl(2)===3) return {bid:'PASS'};
      if((oS==='H'||oS==='S') && cnt[oS]>=3){
        if(hcp>=12) return sb(4,oS);
        return sb(3,oS);
      }
      if(cnt[r2s]>=5 && hcp>=11) return sb(3,r2s);
      if(hcp>=12 && balanced) return sb(3,'NT');
      if(cnt[r2s]>=5) return sb(2,r2s);
      return sb(2,'NT')||{bid:'PASS'};
    }
  }

  // ---------- 3rd/4th rounds ----------
  // Exact minor auction continuations that must not fall through to the generic engine.
  if(a.length===4 && seat===opener && a[0].seat===seat &&
     (a[0].bid==='1♣'||a[0].bid==='1♦') && (a[1].bid==='1♥'||a[1].bid==='1♠') &&
     a[2].bid==='1NT' && a[3].bid===a[1].bid){
    const fs=suitOf(a[1].bid);
    if(cnt[fs]>=3 && hcp>=16) return sb(4,fs);
    if(cnt[fs]>=3 && hcp>=13) return sb(3,fs);
    if(balanced && hcp>=18) return sb(2,'NT');
    return {bid:'PASS'};
  }

  if(a.length>=4){
    // 1m-1M-1NT-2M: responder's natural second bid. Opener may pass,
    // raise with three-card support, or bid 2NT with extras; do not fall
    // through to the generic engine.
    if((bid(0)==='1♣'||bid(0)==='1♦') && (bid(1)==='1♥'||bid(1)==='1♠') &&
       bid(2)==='1NT' && bid(3)===bid(1) && seat===opener){
      if(cnt[rs]>=3 && hcp>=16) return sb(4,rs);
      if(cnt[rs]>=3 && hcp>=13) return sb(3,rs);
      if(balanced && hcp>=18) return sb(2,'NT');
      return {bid:'PASS'};
    }

    // 1m-1M-2M-... : responder's raise continuation.
    if(seat===responder && (rs==='H'||rs==='S') && suit(2)===rs && lvl(2)===2){
      if(hcp>=13) return sb(4,rs);
      if(hcp>=10) return sb(3,rs);
      return {bid:'PASS'};
    }

    // 1m-2X-2Y-2Z: responder's second bid after a 2/1; treat a genuine
    // fourth suit as artificial and forcing, otherwise support or continue naturally.
    if(seat===responder && lvl(1)===2 && lvl(2)===2){
      const suitsSeen=[os,suit(1),suit(2)].filter(x=>x&&x!=='NT');
      const fourth=['C','D','H','S'].find(x=>!suitsSeen.includes(x));
      const current=suit(3), currentL=lvl(3);
      if(currentL===2 && current===fourth && cnt[current]>=4) return sb(3,current)||sb(2,current);
      if((suit(2)==='H'||suit(2)==='S')&&cnt[suit(2)]>=3){
        if(hcp>=12) return sb(4,suit(2));
        if(hcp>=10) return sb(3,suit(2));
      }
      if(hcp>=12&&balanced) return sb(3,'NT');
    }

    // Opener's answer to 4SF after a minor opening.
    if(seat===opener && a.length===4 && lvl(3)===2){
      const responderSuit=suit(1), second=suit(2), fs=suit(3);
      const fourth=['C','D','H','S'].find(x=>![os,responderSuit,second].includes(x));
      if(fourth===fs){
        // After 1m-2X-2Y-2Z, Z is 4SF. First show support for Y (opener's second suit),
        // then a stopper/NT description, then the long minor.
        if(second&&second!=='NT'&&cnt[second]>=3) return sb(3,second);
        if(isBalanced(cnt)&&cnt[fs]>=1&&hcp>=12) return sb(3,'NT');
        if(second&&second!=='NT'&&cnt[second]>=5) return sb(3,second);
        if(hcp>=13) return sb(3,'NT');
      }
    }
  }
  return null;
}

function getAIBid(seat){
  activeAISeat=seat;
  const h=hands[seat], st=stats(h);
  const {hcp,cnt}=st;
  const partner=seat==='N'?'S':seat==='S'?'N':seat==='E'?'W':'E';
  const isNS=seat==='N'||seat==='S';
  const opp1=isNS?'E':'N', opp2=isNS?'W':'S';

  // Full bid histories
  const myBids  = history.filter(x=>x.seat===seat    &&x.bid!=='PASS'&&!x.isX&&!x.isXX);
  const pBids   = history.filter(x=>x.seat===partner  &&x.bid!=='PASS'&&!x.isX&&!x.isXX);
  const oppBids = history.filter(x=>(x.seat===opp1||x.seat===opp2)&&x.bid!=='PASS'&&!x.isX&&!x.isXX);
  const myLast  = myBids[myBids.length-1];
  const pLast   = pBids[pBids.length-1];
  const lastReal= [...history].reverse().find(x=>x.bid!=='PASS'&&!x.isX&&!x.isXX);
  const oppActive= lastReal&&(lastReal.seat===opp1||lastReal.seat===opp2);

  // Partner\u2019s suit and level from their latest bid
  const pSuit = pLast ? suitOf(pLast.bid) : null;
  const pLvl  = pLast ? lvlOf(pLast.bid)  : 0;
  // My suit and level
  const mySuit= myLast ? suitOf(myLast.bid) : null;
  const myLvl = myLast ? lvlOf(myLast.bid)  : 0;

  // Agreed suit: a suit that both partners have bid (showing fit)
  // Look through ALL bids to find a suit bid by both partners
  function agreedSuit(){
    const mySuits = myBids.map(b=>suitOf(b.bid)).filter(Boolean);
    const pSuits  = pBids.map(b=>suitOf(b.bid)).filter(Boolean);
    // Find a suit bid by both (fit = both showed same suit)
    for(const s of mySuits) if(pSuits.includes(s) && s!=='NT') return s;
    // Or: partner raised me (partner bid same suit as my first bid)
    if(myBids.length>=1 && pBids.length>=1){
      const myFirst = suitOf(myBids[0].bid);
      if(myFirst && pSuits.includes(myFirst)) return myFirst;
      const pFirst  = suitOf(pBids[0].bid);
      if(pFirst && mySuits.includes(pFirst)) return pFirst;
    }
    return null;
  }
  const agreed = agreedSuit();

  const sb=(l,s)=>safeBid(l,s);
  let cand=null;

  // ── HARD STOP: above 7NT nothing can be bid ──────────────
  if(lastBidVal>=75) return{bid:'PASS'};

  // ── 0. BLACKWOOD PRIORITY — must respond or act on 4NT ────
  // Answer Blackwood (4NT) — highest priority
  if(mustAnswerBlackwood(seat)){
    return blackwoodResponse(seat);
  }
  // Answer 5NT king ask
  if(mustAnswerFiveNT(seat)){
    return fiveNTResponse(seat);
  }
  // After partner answered our Blackwood, decide final contract
  const bw=lastBlackwood();
  if(bw && bw.seat===seat && blackwoodAnswered()){
    const bwCont=afterBlackwood(seat, agreed);
    if(bwCont) return bwCont;
  }
  // ── 0A. COMPETITIVE PRIORITY — opponent intervention always wins
  // over the uncontested opening-family cores. Otherwise a 1H/1S/minor
  // core can swallow a negative double, takeout-double response or overcall.
  const partnerXEarly=partnerMadeTakeout(seat);
  const oppEarly=lastOppBid(seat);
  if(oppActive){
    const adv=aiAdvancedCompetitive(seat, st, oppEarly, partnerXEarly || pLast);
    if(adv) cand=adv;
    if(!cand) {
      const sd=aiSupportDouble(seat, st, pLast, oppEarly);
      if(sd) cand=sd;
    }
    if(cand) { /* advanced convention handled */ }
    else if(partnerXEarly && myLast){
      // Partner's negative double after our opening: opener must answer it
      // before any uncontested opening-family core gets a chance to fire.
      cand=aiAfterNegDouble(seat, st, myLast, oppEarly);
    } else if(partnerXEarly && !myLast){
      cand=aiResponseToTakeout(seat, st, oppEarly);
    } else if(pLast && !myLast){
      const olvl=lvlOf(oppEarly.bid);
      cand=(olvl>=2 && olvl<=3) ? aiVsJumpOvercall(seat, st, oppEarly) : null;
      if(!cand || cand.bid==='PASS') cand=aiResponseAfterOvercall(seat, st, pLast, oppEarly);
    } else if(!myLast){
      const olvl=lvlOf(oppEarly.bid);
      cand=(olvl>=2 && olvl<=3) ? aiVsJumpOvercall(seat, st, oppEarly) : null;
      if(!cand || cand.bid==='PASS') cand=aiOvercall(st, oppEarly);
    }
  }
  // ── 0B. OPENING-FAMILY CORES — uncontested auction or later continuation
  // Minor openings must be checked first because 1D/1C can be followed by 1H/1S.
  if(!cand){
    const minorCore = fiveMajorMinorCore(seat, st);
    if(minorCore) return minorCore;
    const heartCore=fiveMajorHeartCore(seat, st);
    if(heartCore) return heartCore;
  }


  // ── 1. OPENING (no prior real bid) ────────────────────────
  if(!cand && !lastReal){
    cand = aiOpen(st);

  // ── 2. FIRST RESPONSE ─────────────────────────────────────
  } else if(!cand && !myLast){
    // Ben henüz hiç bid vermedim
    const opp=lastOppBid(seat);
    const ptd=partnerMadeTakeout(seat);
    if(ptd && opp){
      // Partner takeout double yaptı → cevap ver
      cand = aiResponseToTakeout(seat, st, opp);
    } else if(pLast && opp){
      // Partner açtı + rakip overcall yaptı → rekabetçi cevap
      cand = aiResponseAfterOvercall(seat, st, pLast, opp);
    } else if(pLast){
      // Normal ilk cevap
      cand = aiFirstResponse(st, pLast, false);
    } else if(oppActive){
      // Sadece rakip konuştu → preempt/jump overcall, sonra natural overcall/double
      const olvl=lvlOf(lastReal.bid);
      if(olvl>=2 && lastReal.bid!=='2NT' && olvl<=3) cand=aiVsJumpOvercall(seat, st, lastReal);
      if(!cand) cand = aiOvercall(st, lastReal);
    }

  // ── 5. OPENER REBID ────────────────────────────────────────
  } else if(!cand && myLast && pLast && myBids.length===1 && pBids.length===1){
    // Partner negative double yaptı mı?
    const partnerX=history.find(x=>x.seat===partner&&(x.isX||x.bid==='X'));
    const opp=lastOppBid(seat);
    if(partnerX && opp){
      cand = aiAfterNegDouble(seat, st, myLast, opp);
    } else {
      cand = aiOpenerRebid(seat, st, myLast, pLast);
    }

  // ── 6. RESPONDER REBID ─────────────────────────────────────
  } else if(!cand && myLast && pLast && myBids.length===1 && pBids.length>=2){
    cand = aiResponderRebid(seat, st, myLast, pLast);

  // ── 7. LATER AUCTION ───────────────────────────────────────
  } else if(!cand && myLast && pLast){
    // Law of Total Tricks: rekabetçi devam
    const opp=lastOppBid(seat);
    if(opp && agreed){
      const safeLevel=lawOfTotalTricks(seat, st, agreed);
      const sb2=(l,s)=>safeBid(l,s);
      if(safeLevel>=4&&(agreed==='S'||agreed==='H'))
        cand=sb2(4,agreed)||null;
      else if(safeLevel>=3)
        cand=sb2(3,agreed)||null;
    }
    if(!cand) cand = aiLaterAuction(seat, st, myLast, pLast, agreed);
  }

  // ── 8. TAKEOUT DOUBLE (son şans) ────────────────────────────
  if(!cand && oppActive && !myLast){
    if(canDouble(seat) && hcp>=12 && lastBidVal<=40)
      cand={bid:'X',isX:true};
  }

  // ── 9. FORCING KONTROLÜ — partner forcing bid yaptıysa PAS yasak ──
  if((!cand || cand.bid==='PASS')){
    const force=currentForceStatus(seat);
    if(force){
      const fc=forcedContinuation(seat, st, agreed);
      if(fc && fc.bid!=='PASS') cand=fc;
    }
  }

  // ── SAFETY: validate bid ─────────────────────────────────
  if(cand && cand.bid!=='PASS' && !cand.isX && !cand.isXX){
    const l=parseInt(cand.bid[0]); const sk=bidSuitKey(cand.bid);
    if(isNaN(l)||l<1||l>7||bval(l,sk)<=lastBidVal) cand={bid:'PASS'};
  }
  // X/XX güvenlik: canDouble/canRedouble ile doğrula
  if(cand && cand.isX && !canDouble(seat)) cand={bid:'PASS'};
  if(cand && cand.isXX && !canRedouble(seat)) cand={bid:'PASS'};

  // ── SON DEVRE KESİCİ: aynı renk 4+ kez tekrar edilemez ────
  // Hangi fonksiyondan gelirse gelsin, sonsuz tırmanmayı garanti önler.
  if(cand && cand.bid!=='PASS' && !cand.isX && !cand.isXX){
    const csk=bidSuitKey(cand.bid);
    if(suitBidCount(seat,csk)>=4) cand={bid:'PASS'};
  }

  return cand||{bid:'PASS'};
}


/* ── ADVANCED COMPETITIVE CONVENTIONS ──────────────────────── */
function aiAdvancedCompetitive(seat, st, oppBid, pBid){
  if(!oppBid) return null;
  const {hcp,cnt}=st; const sb=(l,s)=>safeBid(l,s);
  const os=suitOf(oppBid.bid), ol=lvlOf(oppBid.bid);
  if(!os) return null;

  // Michaels cue-bid. Optional because it is not part of base SAYC.
  if(conventionEnabled('michaels') && ol===1 && hcp>=8 && hcp<=16){
    if(os==='C'||os==='D'){
      const b=sb(2,os);
      if(b && cnt.H>=4 && cnt.S>=4) return b; // both majors
    } else if(os==='H' && cnt.S>=5){
      const b=sb(2,'H'); if(b && cnt.S>=5 && Math.max(cnt.C,cnt.D)>=5) return b;
    } else if(os==='S' && cnt.H>=5){
      const b=sb(2,'S'); if(b && cnt.H>=5 && Math.max(cnt.C,cnt.D)>=5) return b;
    }
  }

  // Unusual 2NT: optional, weak/competitive two-suited hand.
  if(conventionEnabled('unusual2NT') && ol===1 && hcp>=7 && hcp<=11){
    const lows = os==='S'||os==='H' ? ['C','D'] : ['D','C'];
    const other=lows.every(x=>cnt[x]>=4);
    if(other){ const b=sb(2,'NT'); if(b) return b; }
  }

  // Responsive double after partner's takeout double and RHO's suit bid.
  if(conventionEnabled('responsiveDouble') && pBid && (pBid.isX||pBid.bid==='X') && hcp>=7){
    const majors = (cnt.S>=3)+(cnt.H>=3);
    const minors = (cnt.C>=3)+(cnt.D>=3);
    if((os==='C'||os==='D') && majors>=1){ if(canDouble(seat)) return {bid:'X',isX:true}; }
    if((os==='H'||os==='S') && majors>=1 && minors>=1){ if(canDouble(seat)) return {bid:'X',isX:true}; }
  }

  return null;
}

// Support double: optional convention, showing exactly 3-card support for
// partner's major after a minor opening and an opponent's intervention.
function aiSupportDouble(seat, st, pBid, oppBid){
  if(!conventionEnabled('supportDouble') || !pBid || !oppBid) return null;
  if(!(pBid.bid==='1♥'||pBid.bid==='1♠')) return null;
  const ps=suitOf(pBid.bid), ol=lvlOf(oppBid.bid);
  if(ol!==1) return null;
  const myLast=history.filter(x=>x.seat===seat&&x.bid!=='PASS').slice(-1)[0];
  if(!myLast || !['C','D'].includes(suitOf(myLast.bid))) return null;
  if(cnt[ps]===3 && hcp>=10 && canDouble(seat)) return {bid:'X',isX:true};
  return null;
}

/* ══════════════════════════════════════════════════════════════
   KOMPETİTİF DEKLERE SİSTEMİ
   1. Overcall\u2019dan sonra partner cevabı
   2. Negative Double
   3. Takeout Double\u2019a cevap
   4. Cue bid (force to game)
   5. Law of Total Tricks
   6. Jump overcall
══════════════════════════════════════════════════════════════ */

// Son gerçek rakip bidini bul (partner değil, rakip)
function lastOppBid(seat){
  const partner=seat==='N'?'S':seat==='S'?'N':seat==='E'?'W':'E';
  const isNS=seat==='N'||seat==='S';
  const opp1=isNS?'E':'N', opp2=isNS?'W':'S';
  return [...history].reverse().find(x=>
    (x.seat===opp1||x.seat===opp2)&&x.bid!=='PASS'&&!x.isX&&!x.isXX
  )||null;
}

// Partner\u2019ın ilk bidi neydi?
function partnerFirstBid(seat){
  const partner=seat==='N'?'S':seat==='S'?'N':seat==='E'?'W':'E';
  return history.find(x=>x.seat===partner&&x.bid!=='PASS'&&!x.isX&&!x.isXX)||null;
}

// Partner takeout double yaptı mı?
function partnerMadeTakeout(seat){
  const partner=seat==='N'?'S':seat==='S'?'N':seat==='E'?'W':'E';
  // Partner X yaptı ve öncesinde rakip bid vardı
  const px=history.find(x=>x.seat===partner&&(x.isX||x.bid==='X'));
  if(!px) return null;
  // X\u2019ten önce rakip bid var mıydı?
  const pxIdx=history.indexOf(px);
  const beforeX=history.slice(0,pxIdx).reverse().find(x=>
    x.bid!=='PASS'&&!x.isX&&!x.isXX&&x.seat!==partner
  );
  return beforeX?px:null; // takeout double
}

// ── 1. OVERCALL'DAN SONRA PARTNER CEVABI ──────────────────────
// Durum: partner 1x açtı, rakip overcall yaptı, biz cevap veriyoruz
function aiResponseAfterOvercall(seat, st, pOpen, oppOvercall){
  if(!pOpen||!oppOvercall) return {bid:'PASS'};
  const{hcp,cnt}=st; const sb=(l,s)=>safeBid(l,s);
  const pSuit=suitOf(pOpen.bid), pLvl=lvlOf(pOpen.bid);
  const oppSuit=suitOf(oppOvercall.bid), oppLvl=lvlOf(oppOvercall.bid);
  if(!pSuit||!oppSuit) return {bid:'PASS'};

  // Negative double: show an unbid 4-card major (and 4/5 of the other
  // major where appropriate). Keep it out of very weak hands.
  if(hcp>=7 && canDouble(seat)){
    let neg=false;
    if(oppSuit==='S' && cnt.S>=4 && pSuit!=='S') neg=true;
    else if(oppSuit==='H' && cnt.H>=4 && pSuit!=='H') neg=true;
    else if((oppSuit==='C'||oppSuit==='D') && (cnt.S>=4||cnt.H>=4)) neg=true;
    if(neg) return {bid:'X',isX:true};
  }

  // Support partner's suit. Jump raise = invitational; direct game = strong.
  if(cnt[pSuit]>=3){
    // After an opponent overcall, partner's suit must be raised at the
    // next legal level; rebidding the opening level is impossible.
    if((pSuit==='S'||pSuit==='H') && hcp>=13){ const b=sb(4,pSuit); if(b) return b; }
    if((pSuit==='S'||pSuit==='H') && cnt[pSuit]>=4 && hcp>=10){ const b=sb(3,pSuit); if(b) return b; }
    if((pSuit==='S'||pSuit==='H') && hcp>=6){ const b=sb(2,pSuit); if(b) return b; }
    if((pSuit==='D'||pSuit==='C') && hcp>=10){ const b=sb(3,pSuit); if(b) return b; }
    if((pSuit==='D'||pSuit==='C') && hcp>=6){ const b=sb(2,pSuit); if(b) return b; }
  }

  // New suit: forcing for one round. Prefer a 1-level bid when available;
  // at the 2-level require 10+ HCP and 5+ cards.
  if(hcp>=8){
    for(const suit of ['S','H','D','C']){
      if(suit===oppSuit||suit===pSuit) continue;
      if(cnt[suit]>=5){
        const one=sb(1,suit); if(one) return one;
        if(hcp>=10){ const two=sb(2,suit); if(two) return two; }
      }
    }
  }

  // Cue bid of opponent's suit = limit raise or better in partner's suit.
  if(cnt[pSuit]>=3 && hcp>=10){ const cb=sb(oppLvl+1,oppSuit); if(cb) return cb; }

  // NT response with a stopper. 1NT = 6–10, 2NT = 10–12, 3NT = 13+.
  if(cnt[oppSuit]>=1 && isBalanced(cnt)){
    if(hcp>=13){ const b=sb(3,'NT'); if(b) return b; }
    if(hcp>=10){ const b=sb(2,'NT'); if(b) return b; }
    if(hcp>=6){ const b=sb(1,'NT'); if(b) return b; }
  }
  return {bid:'PASS'};
}

// ── 2. TAKEOUT DOUBLE'A CEVAP ─────────────────────────────────
// Durum: rakip 1x açtı, partner X (takeout) yaptı, biz cevap veriyoruz
function aiResponseToTakeout(seat, st, oppBid){
  if(!oppBid) return {bid:'PASS'};
  const{hcp,cnt}=st; const sb=(l,s)=>safeBid(l,s);
  const oppSuit=suitOf(oppBid.bid), oppLvl=lvlOf(oppBid.bid);
  if(!oppSuit) return {bid:'PASS'};

  // Cue bid of opener's suit = strong hand / game forcing, normally asks
  // partner to describe further.
  if(hcp>=13){
    const cb=sb(oppLvl+1,oppSuit); if(cb) return cb;
  }

  // Balanced NT responses with stopper are preferable to a poor 4-card suit.
  if(isBalanced(cnt) && cnt[oppSuit]>=1){
    if(hcp>=10){ const b=sb(2,'NT'); if(b) return b; }
    if(hcp>=6){ const b=sb(1,'NT'); if(b) return b; }
  }

  // Jump response = invitational (9–11 HCP). Choose longest available
  // unbid suit; jump only when legal.
  if(hcp>=9){
    const suits=['S','H','D','C'].filter(x=>x!==oppSuit).sort((a,b)=>cnt[b]-cnt[a]);
    for(const suit of suits){
      if(cnt[suit]>=4){
        const b=sb(2,suit); if(b) return b;
        const j=sb(3,suit); if(j) return j;
      }
    }
  }

  // Minimum response: lowest legal level in the longest unbid suit.
  const suits=['S','H','D','C'].filter(x=>x!==oppSuit).sort((a,b)=>cnt[b]-cnt[a]);
  for(const suit of suits){
    if(cnt[suit]>=4){ const b=sb(1,suit)||sb(2,suit); if(b) return b; }
  }
  return {bid:'PASS'};
}

// ── 3. NEGATIVE DOUBLE SONRASI OPENER REBID ───────────────────
// Partner negative double yaptı → opener en iyi rengi söyler
function aiAfterNegDouble(seat, st, myOpen, oppOvercall){
  if(!myOpen||!oppOvercall) return {bid:'PASS'};
  const{hcp,cnt}=st;
  const sb=(l,s)=>safeBid(l,s);
  const oppSuit=suitOf(oppOvercall.bid)||'S';
  const mySuit=suitOf(myOpen.bid)||'C';

  // Partner negatif double = diğer majör(ler) var
  // Eğer partner ♥ gösterdi (opp overcall ♠) → ♥ destekle
  if(oppSuit==='S' && cnt.H>=4){
    if(hcp>=17) return sb(3,'H')||{bid:'PASS'}; // güçlü destek
    return sb(2,'H')||{bid:'PASS'}; // normal destek
  }
  if(oppSuit==='H' && cnt.S>=4){
    if(hcp>=17) return sb(3,'S')||{bid:'PASS'};
    return sb(2,'S')||{bid:'PASS'};
  }
  // Minör overcall → partner her iki majörü gösterdi
  if(oppSuit==='D'||oppSuit==='C'){
    if(cnt.S>=4){
      if(hcp>=17) return sb(2,'S')||{bid:'PASS'};
      return sb(1,'S')||{bid:'PASS'};
    }
    if(cnt.H>=4){
      if(hcp>=17) return sb(2,'H')||{bid:'PASS'};
      return sb(1,'H')||{bid:'PASS'};
    }
  }
  // Partner rengi yoksa kendi rengi
  if(mySuit&&mySuit!=='NT'&&cnt[mySuit]>=5){
    return sb(2,mySuit)||{bid:'PASS'};
  }
  if(hcp>=15) return sb(2,'NT')||{bid:'PASS'};
  return sb(1,'NT')||{bid:'PASS'};
}

// ── 4. LAW OF TOTAL TRICKS (yarışmalı deklere kararı) ────────
// Toplam koz sayısı = güvenli oynayabileceğimiz seviye
function lawOfTotalTricks(seat, st, fitSuit){
  const{cnt}=st;
  if(!fitSuit||fitSuit==='NT') return 0;
  // Kendi fitteki koz sayısı (partner\u2019ın koz sayısını tahmin et)
  // Basit kural: kendi kartın + partner için varsayılan 3-4 kart
  const myCnt=cnt[fitSuit]||0;
  const estimatedFit=myCnt+3; // partner minimum 3 kart varsayımı
  // Law: toplam koz = güvenli seviye
  // 8 koz → 2 seviye, 9 → 3, 10 → 4, 11 → 5
  if(estimatedFit>=11) return 5;
  if(estimatedFit>=10) return 4;
  if(estimatedFit>=9)  return 3;
  if(estimatedFit>=8)  return 2;
  return 1;
}

// ── 5. JUMP OVERCALL'A CEVAP ──────────────────────────────────
// Rakip 2 seviyede atlayarak overcall yaptı (preemptive)
function aiVsJumpOvercall(seat, st, oppBid){
  const{hcp,cnt}=st; const sb=(l,s)=>safeBid(l,s);
  if(!oppBid) return {bid:'PASS'};
  const lvl=lvlOf(oppBid.bid), suit=suitOf(oppBid.bid);
  if(lvl<2) return {bid:'PASS'};
  // Strong balanced hand with a stopper: 2NT over a 2-level preempt.
  if(lvl===2 && hcp>=16 && hcp<=18 && isBalanced(cnt) && suit && cnt[suit]>=1){
    const b=sb(2,'NT'); if(b) return b;
  }
  // Takeout double: 13+ with shortness and support for the unbid suits.
  if(canDouble(seat) && hcp>=13 && suit){
    const short=cnt[suit]<=2;
    const support=['S','H','D','C'].filter(x=>x!==suit&&cnt[x]>=3).length;
    if(short&&support>=2) return {bid:'X',isX:true};
  }
  // Natural suit at the cheapest legal level with 5+ and 13+ values.
  for(const x of ['S','H','D','C']){
    if(x!==suit&&cnt[x]>=5&&hcp>=13){ const b=sb(lvl+1,x); if(b) return b; }
  }
  return {bid:'PASS'};
}


/* ══════════════════════════════════════════════════════════════
   COMBINED STRENGTH ESTIMATOR — ZONE BAĞLAMA SİSTEMİ
   Partner\u2019ın bidinden minimum HCP tahmini yaparak
   combined güce göre doğru seviyeye gidilir.
   
   Oyun bölgesi:  NS/EW toplam 25+ HCP veya fit ile 24+
   Slam bölgesi:  33+ HCP (küçük slam), 37+ HCP (grand slam)
══════════════════════════════════════════════════════════════ */

// Partner\u2019ın bidinden minimum HCP tahmini
function partnerMinHCP(bid){
  if(!bid||!bid.bid||bid.bid==='PASS'||bid.isX||bid.isXX) return 0;
  if(typeof bid.bid !== 'string') return 0;
  const b=bid.bid;
  const lvl=lvlOf(b);
  const suit=suitOf(b);
  // Açılış bideleri
  if(lvl===1&&suit==='NT') return 15; // 1NT = 15-17
  if(lvl===2&&suit==='NT') return 20; // 2NT = 20-21
  if(lvl===2&&suit==='C')  return 22; // 2♣ = GÜÇLÜ 22+
  if(lvl===1) return 12; // 1x açılış = 12+
  if(lvl===2) return 6;  // 2♦/♥/♠ weak preempt = 6-10
  if(lvl===3) return 5;  // 3x preempt
  // Cevap bideleri
  if(lvl===1&&suit!=='NT') return 6;   // 1/1 = 6+
  if(lvl===2&&suit!=='NT') return 10;  // 2/1 = 10+
  if(suit==='NT'&&lvl===1) return 6;   // 1NT cevap
  if(suit==='NT'&&lvl===2) return 11;  // 2NT cevap
  if(suit==='NT'&&lvl===3) return 13;  // 3NT cevap
  return 8; // varsayılan minimum
}

// Partner\u2019ın bidinden maksimum HCP tahmini
function partnerMaxHCP(bid){
  if(!bid||bid.bid==='PASS'||bid.isX||bid.isXX) return 37;
  const b=bid.bid;
  const lvl=lvlOf(b);
  const suit=suitOf(b);
  if(lvl===1&&suit==='NT') return 17;
  if(lvl===2&&suit==='NT') return 21;
  if(lvl===2&&suit==='C')  return 37;
  if(lvl===1) return 21;
  if(lvl===2) return 10; // weak
  if(lvl===3) return 10; // preempt
  return 21;
}

// Tüm bid geçmişinden partner için kümülatif HCP tahmini
function estimatePartnerHCP(seat){
  const partner=partnerOf(seat);
  const pBids=history.filter(x=>x.seat===partner&&x.bid!=='PASS'&&!x.isX&&!x.isXX);
  if(!pBids.length) return {min:0,max:37};
  const first=pBids[0];
  const firstLvl=lvlOf(first.bid), firstSuit=suitOf(first.bid);
  const isPreempt=(firstLvl===2&&firstSuit!=='NT'&&firstSuit!=='C')||firstLvl===3||firstLvl===4;
  let min=partnerMinHCP(first);
  let max=partnerMaxHCP(first);

  // Sonraki bidleri sırayla değerlendir: jump mı, sign-off mu?
  for(let i=1;i<pBids.length;i++){
    const b=pBids[i];
    const idx=history.indexOf(b);
    const lvl=lvlOf(b.bid), suit=suitOf(b.bid);
    if(!suit) continue;
    // Bu bidden önceki en yüksek bid neydi? (minimum legal devam neydi?)
    const beforeVal=history.slice(0,idx).reverse().find(h=>h.bid!=='PASS'&&!h.isX&&!h.isXX);
    let minimalLvl=lvl;
    if(beforeVal){
      const bv=bval(lvlOf(beforeVal.bid),suitOf(beforeVal.bid));
      minimalLvl=lvlOf(beforeVal.bid);
      while(bval(minimalLvl,suit)<=bv) minimalLvl++;
    }
    const isJump=lvl>minimalLvl;

    if(isPreempt){
      // Preempt sonrası raise HCP göstermez — sadece minimumu koru
      continue;
    }
    if(isJump){
      // Jump = ekstra güç. Ne kadar ekstra, seviye farkına göre artır.
      const jumpSize=lvl-minimalLvl;
      min=Math.max(min, 16+ (jumpSize>=2?3:0));
      if(lvl>=4) min=Math.max(min,17);
    } else {
      // Minimum (jump olmayan) rebid — sign-off eğilimi, max'ı sıkılaştır
      max=Math.min(max, min+6);
      if(lvl>=3&&suit!=='NT') min=Math.max(min,12);
      if(lvl>=2&&suit==='NT') min=Math.max(min,14);
    }
  }
  if(min>max) max=min+4; // tutarlılık güvencesi
  return {min,max};
}

// Combined HCP aralığı hesapla
function combinedHCP(seat, myHCP){
  try{
    const p=estimatePartnerHCP(seat);
    return {
      min: myHCP+(p.min||0),
      max: myHCP+(p.max||37),
      likely: myHCP+Math.round(((p.min||0)+(p.max||21))/2)
    };
  }catch(e){
    return {min:myHCP, max:myHCP+21, likely:myHCP+12};
  }
}

// Zone hedefi: combined gücüne göre ne oynamalı?
function targetContract(combined, fitSuit, fitLen){
  if(!combined) return {level:2,suit:'NT',reason:'Varsayılan'};
  const min=combined.min||0;
  const likely=combined.likely||combined.min||0;
  fitLen=fitLen||0;
  const isMajor=fitSuit==='S'||fitSuit==='H';
  const hasFit=fitLen>=8;
  
  // Grand Slam
  if(min>=37) return {level:7,suit:hasFit?fitSuit:'NT',reason:'Grand Slam (37+ HCP)'};
  if(likely>=36&&hasFit) return {level:7,suit:fitSuit,reason:'Grand Slam denemesi'};
  
  // Small Slam
  if(min>=33) return {level:6,suit:hasFit?fitSuit:'NT',reason:'Küçük Slam (33+ HCP)'};
  if(likely>=32&&hasFit) return {level:6,suit:fitSuit,reason:'Slam denemesi'};
  
  // Game
  if(min>=25&&hasFit&&isMajor) return {level:4,suit:fitSuit,reason:'Majör oyun (25+ HCP)'};
  if(min>=26&&!hasFit) return {level:3,suit:'NT',reason:'3NT oyun (26+ HCP)'};
  if(min>=25&&hasFit) return {level:5,suit:fitSuit,reason:'Minör oyun'};
  if(likely>=25&&hasFit&&isMajor) return {level:4,suit:fitSuit,reason:'Olası oyun'};
  if(likely>=26) return {level:3,suit:'NT',reason:'Olası 3NT'};
  
  // Invite
  if(min>=22&&hasFit&&isMajor) return {level:3,suit:fitSuit,reason:'Davet (22+ HCP)'};
  if(min>=22) return {level:2,suit:'NT',reason:'2NT davet'};
  
  // Partscore
  if(hasFit) return {level:2,suit:fitSuit,reason:'Partscore'};
  return {level:1,suit:'NT',reason:'Minimum'};
}

/* ── AGGRESSIVE TOTAL: HCP + distribution + fit bonus ───── */
// fitLen: number of cards in agreed/shown fit suit (0 if unknown)
function aggrTotal(st, fitLen=0){
  const{hcp,dist,cnt}=st;
  // Long suit bonus: extra for 6+ card suits beyond distribution
  let longBonus=0;
  Object.values(cnt).forEach(n=>{ if(n>=6)longBonus+=1; if(n>=7)longBonus+=1; });
  // Fit bonus: when 8-card fit found, dummy points kick in
  let fitBonus=0;
  if(fitLen>=8) fitBonus=1;
  if(fitLen>=9) fitBonus=2;
  return hcp+dist+longBonus+fitBonus;
}

/* ── OPENING ─────────────────────────────────────────────── */
function aiOpen(st){
  const{hcp,cnt,total}=st; const sb=(l,s)=>safeBid(l,s);
  if(hcp>=22||total>=22)          return sb(2,'C')||{bid:'PASS'};
  if(hcp>=20&&isBalanced(cnt))    return sb(2,'NT')||{bid:'PASS'};
  if(hcp>=15&&hcp<=17&&isBalanced(cnt)) return sb(1,'NT')||{bid:'PASS'};
  // Preempts (weak 2s/3s)
  // KURAL: 2♣ = HER ZAMAN GÜÇLÜ (22+ HCP) — zayıf 2♣ YASAK
  // Zayıf 2: sadece ♦/♥/♠ için (2♣ değil!)
  // Zayıf 3: tüm renkler için (3♣ dahil)
  if(hcp>=5&&hcp<=11){
    // 7 kartlı: 3 seviye preempt (3♣ dahil)
    for(const s of SK) if(cnt[s]>=7){const b=sb(3,s);if(b)return b;}
    // 6 kartlı: 2 seviye preempt — AMA 2♣ DEĞİL (sadece ♦/♥/♠)
    const preemptSuits=['S','H','D']; // ♣ hariç!
    for(const s of preemptSuits) if(cnt[s]>=6){const b=sb(2,s);if(b)return b;}
  }
  // Normal opening 12+
  if(hcp>=12||total>=13){
    if(cnt.S>=5) return sb(1,'S')||{bid:'PASS'};
    if(cnt.H>=5) return sb(1,'H')||{bid:'PASS'};
    if(cnt.D>=4&&cnt.D>=cnt.C) return sb(1,'D')||{bid:'PASS'};
    return sb(1,'C')||{bid:'PASS'};
  }
  return{bid:'PASS'};
}

/* ── FIRST RESPONSE (aggressive) ────────────────────────── */
function aiFirstResponse(st, pLast, oppActive){
  const{hcp,cnt}=st;
  const tot=aggrTotal(st); // use total pts for fit decisions
  const sb=(l,s)=>safeBid(l,s);
  const pb=pLast.bid; const psym=pb.slice(1); const plvl=lvlOf(pb);
  const psk=suitOf(pb);

  // Response to 2C (strong, forcing)
  if(pb==='2♣'||pb===bstr(2,'C')){
    if(cnt.S>=5&&hcp>=6) return sb(2,'S')||{bid:'PASS'};
    if(cnt.H>=5&&hcp>=6) return sb(2,'H')||{bid:'PASS'};
    if(hcp>=6)           return sb(2,'NT')||{bid:'PASS'};
    return sb(2,'D')||{bid:'PASS'};
  }
  // Response to 2NT (20-21) — Jacoby + Stayman
  if(pb==='2NT'){
    // Slam zone
    if(hcp>=11) return sb(6,'NT')||{bid:'PASS'}; // 31+ combined
    if(hcp>=9&&(cnt.S>=5||cnt.H>=5)){
      if(cnt.H>=5) return sb(3,'D')||{bid:'PASS'}; // transfer to ♥
      if(cnt.S>=5) return sb(3,'H')||{bid:'PASS'}; // transfer to ♠
    }
    // Majors with 5 cards
    if(cnt.H>=5) return sb(3,'D')||{bid:'PASS'}; // Jacoby: 3♦→♥
    if(cnt.S>=5) return sb(3,'H')||{bid:'PASS'}; // Jacoby: 3♥→♠
    // 4-card majors → Stayman
    if(cnt.S>=4||cnt.H>=4) return sb(3,'C')||{bid:'PASS'}; // Stayman over 2NT
    // Balanced game
    if(hcp>=4) return sb(3,'NT')||{bid:'PASS'};
    return{bid:'PASS'};
  }
  // ═══ Response to 1NT (15-17) — FULL SYSTEM ═══════════════
  // Jacoby Transfers + Stayman + Quantitative
  if(pb==='1NT'){
    // SLAM ZONE (combined 33+): quantitative 4NT or direct slam
    if(hcp>=16) return sb(4,'NT')||{bid:'PASS'}; // Quantitative 4NT (slam invite)
    if(hcp>=15) return sb(6,'NT')||{bid:'PASS'}; // Direct 6NT (33+ HCP)

    // GAME ZONE: 5-card majors → Jacoby Transfer
    // Transfer 2♦ → partner bids 2♥, then we raise
    if(cnt.H>=6&&hcp>=8) return sb(4,'H')||{bid:'PASS'}; // direct 4H with 6+ cards
    if(cnt.S>=6&&hcp>=8) return sb(4,'S')||{bid:'PASS'}; // direct 4S with 6+ cards
    if(cnt.H>=5&&hcp>=8) return sb(2,'D')||{bid:'PASS'}; // Jacoby: 2♦ = transfer to ♥
    if(cnt.S>=5&&hcp>=8) return sb(2,'H')||{bid:'PASS'}; // Jacoby: 2♥ = transfer to ♠

    // GAME ZONE: 4-card majors → Stayman
    if((cnt.S>=4||cnt.H>=4)&&hcp>=8) return sb(2,'C')||{bid:'PASS'}; // Stayman

    // GAME ZONE: no major fit, balanced
    if(hcp>=9) return sb(3,'NT')||{bid:'PASS'}; // direct 3NT game

    // INVITE ZONE (8-9 HCP)
    if(cnt.H>=5&&hcp>=7) return sb(2,'D')||{bid:'PASS'}; // transfer invite
    if(cnt.S>=5&&hcp>=7) return sb(2,'H')||{bid:'PASS'}; // transfer invite
    if(cnt.H>=4&&hcp>=7) return sb(2,'C')||{bid:'PASS'}; // Stayman invite
    if(cnt.S>=4&&hcp>=7) return sb(2,'C')||{bid:'PASS'};
    if(hcp>=7) return sb(2,'NT')||{bid:'PASS'}; // balanced invite

    // SIGN-OFF: weak hand with long suit
    if(cnt.H>=5&&hcp>=3) return sb(2,'D')||{bid:'PASS'}; // transfer to escape
    if(cnt.S>=5&&hcp>=3) return sb(2,'H')||{bid:'PASS'};
    if(cnt.C>=6&&hcp>=2) return sb(2,'S')||{bid:'PASS'}; // 2♠ = transfer to ♣
    if(cnt.D>=6&&hcp>=2) return sb(2,'D')||{bid:'PASS'}; // 2♦ = transfer to ♥ (escape via transfer)

    // 0-6 HCP: PASS (opener at 15-17 so combined max 23, not enough for game)
    return{bid:'PASS'};
  }
  // Preempt responses: aggressive fit raises
  if(plvl>=2 && psk && psk!=='NT'){
    if(cnt[psk]>=4&&hcp>=8)  return sb(4,psk)||{bid:'PASS'}; // splinter raise
    if(cnt[psk]>=3&&hcp>=8)  return sb(4,psk)||{bid:'PASS'};
    if(cnt[psk]>=3&&hcp>=5)  return sb(plvl+1,psk)||{bid:'PASS'};
    return{bid:'PASS'};
  }
  // Response to 1♠ — Standard American / SAYC core
  if(psym===SUITS.S.sym){
    // 1♠-4♠: preemptive/game sign-off with 5+ spades and limited values.
    // This must be checked BEFORE 2♠, otherwise the 4♠ branch is unreachable.
    if(cnt.S>=5&&hcp>=5&&hcp<=9) return sb(4,'S')||{bid:'PASS'};
    // 1♠-3♠: limit raise, roughly 10-12 HCP and 4+ spades
    if(cnt.S>=4&&hcp>=10&&hcp<=12) return sb(3,'S')||{bid:'PASS'};
    // 1♠-2♠: simple raise, roughly 6-9 HCP and 3+ spades
    if(cnt.S>=3&&hcp>=6&&hcp<=9) return sb(2,'S')||{bid:'PASS'};
    // 2/1 response: 10+ HCP, 5+ suit. Prefer hearts over minors when both are available.
    if(cnt.H>=5&&hcp>=10) return sb(2,'H')||{bid:'PASS'};
    if(cnt.D>=5&&hcp>=10) return sb(2,'D')||{bid:'PASS'};
    if(cnt.C>=5&&hcp>=10) return sb(2,'C')||{bid:'PASS'};
    // 1NT response: 6-9 HCP, no suitable 3-card spade raise.
    if(hcp>=6&&hcp<=9) return sb(1,'NT')||{bid:'PASS'};
    // 1♠-2NT is not treated as Jacoby in this first V2 pass; avoid inventing a convention.
    return{bid:'PASS'};
  }
  // Response to 1♥
  if(psym===SUITS.H.sym){
    if(cnt.H>=5&&hcp>=14) return sb(4,'H')||{bid:'PASS'};
    if(cnt.H>=4&&hcp>=12) return sb(3,'H')||{bid:'PASS'}; // was 13
    if(cnt.H>=4&&tot>=20) return sb(4,'H')||{bid:'PASS'}; // distributional game
    if(cnt.H>=3&&hcp>=5)  return sb(2,'H')||{bid:'PASS'}; // was 6
    if(cnt.S>=4&&hcp>=5)  return sb(1,'S')||{bid:'PASS'};
    if(cnt.D>=4&&hcp>=8)  return sb(2,'D')||{bid:'PASS'}; // was 10
    if(cnt.C>=4&&hcp>=8)  return sb(2,'C')||{bid:'PASS'};
    if(hcp>=5)            return sb(1,'NT')||{bid:'PASS'};
    return{bid:'PASS'};
  }
  // Response to 1♦ / 1♣
  if(psym===SUITS.D.sym||psym===SUITS.C.sym){
    if(cnt.S>=4&&hcp>=5)  return sb(1,'S')||{bid:'PASS'}; // was 6
    if(cnt.H>=4&&hcp>=5)  return sb(1,'H')||{bid:'PASS'};
    if(psk==='D'&&cnt.D>=5&&hcp>=8) return sb(2,'D')||{bid:'PASS'}; // was 10
    if(psk==='C'&&cnt.C>=5&&hcp>=8) return sb(2,'C')||{bid:'PASS'};
    if(hcp>=11)           return sb(2,'NT')||{bid:'PASS'}; // was 13
    if(hcp>=5)            return sb(1,'NT')||{bid:'PASS'};
    return{bid:'PASS'};
  }
  return{bid:'PASS'};
}

/* ── COMPETITIVE OVER THEIR 1NT INTERFERENCE ───────────── */
// If opponents double/overcall partner\u2019s 1NT, escape or compete
function aiCompetitiveOver1NT(st, pLast, oppBid){
  const{hcp,cnt}=st; const sb=(l,s)=>safeBid(l,s);
  // If opponent doubled our 1NT (Dbl = takeout or penalties)
  if(oppBid.isX){
    // Run with long suit if weak
    if(cnt.H>=5&&hcp<=7) return sb(2,'H')||{bid:'PASS'}; // escape
    if(cnt.S>=5&&hcp<=7) return sb(2,'S')||{bid:'PASS'};
    if(cnt.D>=5&&hcp<=7) return sb(2,'D')||{bid:'PASS'};
    if(cnt.C>=5&&hcp<=7) return sb(2,'C')||{bid:'PASS'};
    if(hcp>=9) return sb(2,'NT')||{bid:'PASS'}; // strong: redouble or NT
    return{bid:'PASS'}; // let partner decide
  }
  // Opponent overcalled → if we have a fit or game values, bid
  const oppSuit=suitOf(oppBid.bid);
  if(hcp>=9) return sb(2,'NT')||{bid:'PASS'}; // still game values
  if(cnt.H>=5&&hcp>=6) return sb(2,'H')||{bid:'PASS'};
  if(cnt.S>=5&&hcp>=6) return sb(2,'S')||{bid:'PASS'};
  return{bid:'PASS'};
}

/* ── OVERCALL ────────────────────────────────────────────── */
function aiOvercall(st, lastOppBid){
  const{hcp,cnt}=st; const sb=(l,s)=>safeBid(l,s);
  if(!lastOppBid) return {bid:'PASS'};
  const oppSuit=suitOf(lastOppBid.bid), oppLvl=lvlOf(lastOppBid.bid);
  const stop=oppSuit&&cnt[oppSuit]>=1;

  // 1NT overcall: 15–18 balanced with a stopper in opener's suit.
  if(oppLvl===1 && hcp>=15 && hcp<=18 && isBalanced(cnt) && stop){
    const b=sb(1,'NT'); if(b) return b;
  }

  // Takeout double: 12+ HCP, shortness in opener's suit and at least
  // three-card support for the other suits. Avoid double with a long
  // natural suit that is better shown as an overcall.
  if(canDouble(activeAISeat) && hcp>=12 && oppSuit){
    const short=cnt[oppSuit]<=2;
    const maxOther=Math.max(...['S','H','D','C'].filter(x=>x!==oppSuit).map(x=>cnt[x]));
    const supportOther=['S','H','D','C'].filter(x=>x!==oppSuit).filter(x=>cnt[x]>=3).length;
    if(short && supportOther>=2 && !(maxOther>=6 && hcp<15)) return {bid:'X',isX:true};
  }

  // Natural overcalls. 1-level: 8–17 HCP, normally 5+ cards and a
  // playable suit. 2-level: 10–17 HCP and normally 5+ cards (6+ clubs
  // is preferred at the 2-level because 2C is otherwise a strong opening
  // bid only when we are the opener).
  const order=['S','H','D','C'];
  if(oppLvl===1){
    for(const suit of order){
      if(cnt[suit]>=5 && hcp>=8 && hcp<=17){
        const b=sb(1,suit); if(b) return b;
      }
    }
  } else if(oppLvl===2){
    for(const suit of order){
      if(cnt[suit]>=5 && hcp>=10 && hcp<=17){
        const b=sb(2,suit); if(b) return b;
      }
    }
  }
  return {bid:'PASS'};
}

/* ── OPENER REBID — Zone-aware ──────────────────────────── */
function aiOpenerRebid(seat, st, myLast, pLast){
  const spadeCore=fiveMajorSpadeCore(seat, st);
  if(spadeCore) return spadeCore;

  const{hcp,cnt}=st;
  const tot=aggrTotal(st);
  const sb=(l,s)=>safeBid(l,s);
  const mySuit=suitOf(myLast.bid), myLvl=lvlOf(myLast.bid);
  const pSuit =suitOf(pLast.bid),  pLvl =lvlOf(pLast.bid);
  const myFit = mySuit&&mySuit!=='NT' ? aggrTotal(st, cnt[mySuit]+3) : tot;

  // ── 1NT/2NT JACOBY + STAYMAN — ÖNCELİKLİ ──────────────────
  if(myLast.bid==='1NT'){
    if(pSuit==='D'&&pLvl===2) return sb(2,'H')||{bid:'PASS'}; // transfer→♥
    if(pSuit==='H'&&pLvl===2) return sb(2,'S')||{bid:'PASS'}; // transfer→♠
    if(pSuit==='S'&&pLvl===2) return sb(3,'C')||{bid:'PASS'}; // minor transfer
    if(pSuit==='C'&&pLvl===2){ // Stayman
      if(cnt.S>=4&&cnt.H>=4) return sb(2,'S')||{bid:'PASS'};
      if(cnt.S>=4) return sb(2,'S')||{bid:'PASS'};
      if(cnt.H>=4) return sb(2,'H')||{bid:'PASS'};
      return sb(2,'D')||{bid:'PASS'};
    }
    if(pSuit==='NT'&&pLvl===4) return hcp>=17?sb(6,'NT')||{bid:'PASS'}:{bid:'PASS'};
  }
  if(myLast.bid==='2NT'){
    if(pSuit==='D'&&pLvl===3) return sb(3,'H')||{bid:'PASS'};
    if(pSuit==='H'&&pLvl===3) return sb(3,'S')||{bid:'PASS'};
    if(pSuit==='C'&&pLvl===3){
      if(cnt.S>=4) return sb(3,'S')||{bid:'PASS'};
      if(cnt.H>=4) return sb(3,'H')||{bid:'PASS'};
      return sb(3,'D')||{bid:'PASS'};
    }
  }


  // ── ZONE ESTIMATE ──────────────────────────────────────────
  // Partner\u2019ın gücünü tahmin et ve hedef kontratı belirle
  const combined=combinedHCP(seat,hcp);
  const fitSuit=mySuit&&mySuit!=='NT'?mySuit:(pSuit&&pSuit!=='NT'?pSuit:null);
  const fitLen=fitSuit?cnt[fitSuit]:0;
  const target=targetContract(combined, fitSuit, fitLen+(fitSuit?3:0)); // +3 partner için

  // Slam bölgesi → Blackwood
  if(target.level>=6 && fitSuit && !lastBlackwood()){
    return sb(4,'NT')||{bid:'PASS'}; // Blackwood
  }
  if(target.level>=6 && !fitSuit){
    return sb(target.level,'NT')||{bid:'PASS'};
  }

  // Partner supported our major — use combined estimate
  if(pSuit===mySuit && (mySuit==='S'||mySuit==='H')){
    if(target.level>=4||hcp>=17||myFit>=22) return sb(4,mySuit)||{bid:'PASS'};
    if(target.level>=3||hcp>=15||myFit>=20) return sb(3,mySuit)||{bid:'PASS'};
    if(hcp>=13) return sb(pLvl+1,mySuit)||{bid:'PASS'};
    return{bid:'PASS'};
  }

  // Partner bid NT
  if(pSuit==='NT'){
    if(mySuit==='S'||mySuit==='H'){
      if(hcp>=17||tot>=22) return sb(4,mySuit)||{bid:'PASS'}; // was 19
      if(hcp>=15)          return sb(3,mySuit)||{bid:'PASS'}; // was 17
      if(hcp>=13)          return sb(2,mySuit)||{bid:'PASS'}; // was 15
    }
    if(hcp>=17||tot>=22) return sb(3,'NT')||{bid:'PASS'}; // was 19
    if(hcp>=15)          return sb(2,'NT')||{bid:'PASS'}; // was 17
    return{bid:'PASS'};
  }

  // Partner bid a new suit (1/1 or 2/1)
  if(pSuit && pSuit!==mySuit){
    const pFit=cnt[pSuit]||0;
    // Support partner\u2019s major
    if((pSuit==='S'||pSuit==='H')&&pFit>=4){
      if(hcp>=15||tot>=20) return sb(4,pSuit)||{bid:'PASS'}; // was 17
      if(hcp>=12)          return sb(3,pSuit)||{bid:'PASS'}; // was 14
      return sb(2,pSuit)||{bid:'PASS'};
    }
    if((pSuit==='S'||pSuit==='H')&&pFit===3){
      if(hcp>=16) return sb(4,pSuit)||{bid:'PASS'};
      if(hcp>=13) return sb(3,pSuit)||{bid:'PASS'};
      return sb(2,pSuit)||{bid:'PASS'};
    }
    // Rebid own suit
    if((mySuit==='S'||mySuit==='H')&&cnt[mySuit]>=6){
      if(hcp>=15||tot>=20) return sb(3,mySuit)||{bid:'PASS'}; // was 17
      return sb(2,mySuit)||{bid:'PASS'};
    }
    if(cnt[mySuit]>=5&&mySuit&&mySuit!=='NT'&&suitBidCount(seat,mySuit)<2&&hcp>=14){
      return sb(myLvl+1,mySuit)||{bid:'PASS'};
    }
    // Jump shift with strong hand + fit
    if(hcp>=17&&pFit>=4) return sb(3,pSuit)||{bid:'PASS'}; // was 19
    // NT rebid
    if(hcp>=16||tot>=20) return sb(2,'NT')||{bid:'PASS'}; // was 18
    if(hcp>=12&&isBalanced(cnt)) return sb(1,'NT')||{bid:'PASS'}; // was 15
    // Second suit
    if(mySuit==='S'&&cnt.H>=4) return sb(2,'H')||{bid:'PASS'};
    if(mySuit==='H'&&cnt.S>=4) return sb(2,'S')||{bid:'PASS'};
    if(mySuit==='C'&&cnt.D>=4) return sb(2,'D')||{bid:'PASS'};
    if(hcp>=11&&isBalanced(cnt)) return sb(1,'NT')||{bid:'PASS'}; // was 12
  }

  // Transfer/Stayman artık fonksiyon başında işleniyor

  return{bid:'PASS'};
}

/* ── RESPONDER REBID — Zone-aware + Transfer completions ── */
function aiResponderRebid(seat, st, myLast, pLast){
  const spadeCore=fiveMajorSpadeCore(seat, st);
  if(spadeCore) return spadeCore;

  const{hcp,cnt}=st;
  const tot=aggrTotal(st);
  const sb=(l,s)=>safeBid(l,s);
  const mySuit=suitOf(myLast.bid), myLvl=lvlOf(myLast.bid);
  const pSuit =suitOf(pLast.bid),  pLvl =lvlOf(pLast.bid);

  // ── ZONE ESTIMATE ──────────────────────────────────────────
  const combined=combinedHCP(seat,hcp);
  const fitSuit=pSuit&&pSuit!=='NT'?pSuit:(mySuit&&mySuit!=='NT'?mySuit:null);
  const fitLen=fitSuit?(cnt[fitSuit]||0):0;
  const target=targetContract(combined, fitSuit, fitLen+3);

  // Slam bölgesi → Blackwood (sadece fit varsa)
  if(target.level>=6 && fitSuit && !lastBlackwood()){
    return sb(4,'NT')||{bid:'PASS'};
  }

  // Direkt oyun bölgesi (combined 25+, fit major)
  if(target.level>=4 && fitSuit && (fitSuit==='S'||fitSuit==='H') && !lastBlackwood()){
    return sb(4,fitSuit)||{bid:'PASS'};
  }
  if(target.level>=3 && !fitSuit){
    return sb(3,'NT')||{bid:'PASS'};
  }

  // ── JACOBY TRANSFER COMPLETIONS ──────────────────────────
  // We bid 2♦ (transfer to ♥), opener bid 2♥ → now complete
  if(myLast.bid===bstr(2,'D') && pSuit==='H' && pLvl===2){
    // Partner accepted 2♦ → 2♥ transfer
    if(cnt.H>=6&&hcp>=8) return sb(4,'H')||{bid:'PASS'}; // game with 6+ hearts
    if(cnt.H>=5&&hcp>=9) return sb(4,'H')||{bid:'PASS'}; // game invite accepted
    if(cnt.H>=5&&hcp>=7) return sb(3,'H')||{bid:'PASS'}; // invite
    if(cnt.H>=5) return{bid:'PASS'}; // sign-off in 2♥
    return{bid:'PASS'};
  }
  // We bid 2♥ (transfer to ♠), opener bid 2♠ → now complete
  if(myLast.bid===bstr(2,'H') && pSuit==='S' && pLvl===2){
    if(cnt.S>=6&&hcp>=8) return sb(4,'S')||{bid:'PASS'};
    if(cnt.S>=5&&hcp>=9) return sb(4,'S')||{bid:'PASS'};
    if(cnt.S>=5&&hcp>=7) return sb(3,'S')||{bid:'PASS'};
    if(cnt.S>=5) return{bid:'PASS'}; // sign-off
    return{bid:'PASS'};
  }
  // We bid 2♣ (Stayman), opener denied major (2♦) → NT
  if(myLast.bid===bstr(2,'C') && pSuit==='D' && pLvl===2){
    if(hcp>=9) return sb(3,'NT')||{bid:'PASS'}; // game
    return sb(2,'NT')||{bid:'PASS'}; // invite
  }
  // Stayman found spade fit (2♠)
  if(myLast.bid===bstr(2,'C') && pSuit==='S' && pLvl===2){
    if(cnt.S>=4&&hcp>=9) return sb(4,'S')||{bid:'PASS'}; // game
    if(cnt.S>=4&&hcp>=7) return sb(3,'S')||{bid:'PASS'}; // invite
    if(hcp>=9) return sb(3,'NT')||{bid:'PASS'}; // no spade fit, play NT
    return sb(2,'NT')||{bid:'PASS'};
  }
  // Stayman found heart fit (2♥)
  if(myLast.bid===bstr(2,'C') && pSuit==='H' && pLvl===2){
    if(cnt.H>=4&&hcp>=9) return sb(4,'H')||{bid:'PASS'};
    if(cnt.H>=4&&hcp>=7) return sb(3,'H')||{bid:'PASS'};
    if(hcp>=9) return sb(3,'NT')||{bid:'PASS'};
    return sb(2,'NT')||{bid:'PASS'};
  }
  // 2NT over 2NT (3♦ transfer accepted → 3♥)
  if(myLast.bid===bstr(3,'D') && pSuit==='H' && pLvl===3){
    if(hcp>=8) return sb(4,'H')||{bid:'PASS'};
    return sb(4,'H')||{bid:'PASS'}; // always game after 2NT + transfer
  }
  if(myLast.bid===bstr(3,'H') && pSuit==='S' && pLvl===3){
    if(hcp>=8) return sb(4,'S')||{bid:'PASS'};
    return sb(4,'S')||{bid:'PASS'};
  }

  // Opener rebid our suit — confirmed fit, bid game more freely
  if(pSuit===mySuit){
    const fitTot=aggrTotal(st, cnt[mySuit]+5); // opener has 5+
    if(hcp>=11||fitTot>=22) return sb(4,mySuit)||{bid:'PASS'}; // was 13
    if(hcp>=9||fitTot>=20)  return sb(3,mySuit)||{bid:'PASS'}; // was 10
    return{bid:'PASS'};
  }
  // Opener confirmed a major — support with 3+
  if((pSuit==='S'||pSuit==='H')&&cnt[pSuit]>=3){
    const fitTot=aggrTotal(st, cnt[pSuit]+5);
    if(hcp>=11||fitTot>=22) return sb(4,pSuit)||{bid:'PASS'}; // was 13
    if(hcp>=8||fitTot>=19)  return sb(3,pSuit)||{bid:'PASS'}; // was 10
    return sb(2,pSuit)||{bid:'PASS'};
  }
  // NT bidding — slightly more aggressive
  if(pSuit==='NT'){
    if(hcp>=11||tot>=16) return sb(3,'NT')||{bid:'PASS'}; // was 13
    if(hcp>=9)           return sb(2,'NT')||{bid:'PASS'}; // was 11
    return{bid:'PASS'};
  }
  // Opener new suit — push to game if enough
  if(hcp>=11||tot>=17) return sb(3,'NT')||{bid:'PASS'}; // was 13
  if(hcp>=9&&pLvl>=2)  return sb(2,'NT')||{bid:'PASS'}; // was 11
  // Rebid own 6-card suit
  if(mySuit&&mySuit!=='NT'&&cnt[mySuit]>=6&&suitBidCount(seat,mySuit)<3) return sb(myLvl+1,mySuit)||{bid:'PASS'};
  // Rebid own 5-card suit if at good level
  if(mySuit&&mySuit!=='NT'&&cnt[mySuit]>=5&&hcp>=8&&suitBidCount(seat,mySuit)<3) return sb(myLvl+1,mySuit)||{bid:'PASS'};
  return{bid:'PASS'};
}

/* ── LATER AUCTION (3rd bid onward, agreed suit known) ─────
   This is the critical missing piece. Key rule:
   Once a fit is established, bid based on combined point count.
   If no fit, look for 3NT or pass.
─────────────────────────────────────────────────────────── */
function aiLaterAuction(seat, st, myLast, pLast, agreed){
  const spadeCore=fiveMajorSpadeCore(seat, st);
  if(spadeCore) return spadeCore;

  const{hcp,cnt}=st; const sb=(l,s)=>safeBid(l,s);
  const mySuit=suitOf(myLast.bid), myLvl=lvlOf(myLast.bid);
  const pSuit =suitOf(pLast.bid),  pLvl =lvlOf(pLast.bid);
  const partner=partnerOf(seat);

  // ── TAM AUCTION GEÇMİŞİ — sadece son bide değil, tüm geçmişe bak ──
  const myBidsAll=history.filter(x=>x.seat===seat&&x.bid!=='PASS'&&!x.isX&&!x.isXX);
  const pBidsAll =history.filter(x=>x.seat===partner&&x.bid!=='PASS'&&!x.isX&&!x.isXX);

  // ── FIT TESPİTİ: agreed varsa onu kullan, yoksa partnerin son rengine bak ──
  let fitSuit=agreed;
  if(!fitSuit && pSuit && pSuit!=='NT' && (cnt[pSuit]||0)>=3) fitSuit=pSuit;
  const fitLen=fitSuit ? (cnt[fitSuit]||0) : 0;

  // ── COMBINED GÜÇ TAHMİNİ — merkezi altyapıyı kullan ──
  const combined=combinedHCP(seat,hcp);
  const target=targetContract(combined, fitSuit, fitLen+3); // partner min 3 kart fit varsayımı

  // ── FORCING DURUMU ──
  const force=currentForceStatus(seat);

  // ── 1. SLAM BÖLGESİ ────────────────────────────────────────
  if(target.level>=6 && fitSuit && fitSuit!=='NT'){
    if(!lastBlackwood() && shouldAsk4NT(seat, st, fitSuit)){
      const bw=sb(4,'NT'); if(bw) return bw;
    }
    if(combined.min>=33){
      const slam=sb(target.level,fitSuit)||sb(6,fitSuit); if(slam) return slam;
    }
  }
  if(target.level>=6 && (!fitSuit||fitSuit==='NT') && combined.min>=33){
    const slamNT=sb(6,'NT'); if(slamNT) return slamNT;
  }

  // ── 2. OYUN BÖLGESİ — hedefe DİREKT git, aşama aşama değil ──
  if(target.level>=4 && fitSuit && (fitSuit==='S'||fitSuit==='H')){
    const g=sb(4,fitSuit); if(g) return g;
  }
  if(target.level>=5 && fitSuit && (fitSuit==='C'||fitSuit==='D')){
    const g=sb(5,fitSuit); if(g) return g;
  }
  if(target.level>=3 && (!fitSuit||fitSuit==='NT')){
    const g=sb(3,'NT'); if(g) return g;
  }
  // Minör fit ama NT daha güvenli olabilir (26+ dengeli)
  if(target.level>=3 && fitSuit && (fitSuit==='C'||fitSuit==='D') && isBalanced(cnt) && combined.min>=25){
    const g=sb(3,'NT'); if(g) return g;
  }

  // ── 3. DAVET BÖLGESİ ───────────────────────────────────────
  if(target.level===3 && fitSuit && (fitSuit==='S'||fitSuit==='H')){
    const inv=sb(3,fitSuit); if(inv) return inv;
  }
  if(target.level===2 && (!fitSuit||fitSuit==='NT')){
    const inv=sb(2,'NT'); if(inv) return inv;
  }

  // ── 4. PARTNER YENİ RENK GÖSTERDİ — destek ara ────────────
  if(pSuit && pSuit!==mySuit && pSuit!=='NT'){
    if((pSuit==='S'||pSuit==='H')&&cnt[pSuit]>=3){
      const lvl=Math.max(pLvl+1, target.level>=4?4:pLvl+1);
      const sup=sb(lvl,pSuit); if(sup) return sup;
      const sup2=sb(pLvl+1,pSuit); if(sup2) return sup2;
    }
    // Kendi uzun rengimi tekrar söyle — SADECE hedef gerçekten daha
    // yüksek seviye gerektiriyorsa VE bu rengi 3'ten az kez söylediysem
    const curLvlNow=Math.max(myLvl,pLvl);
    if(mySuit&&mySuit!=='NT'&&cnt[mySuit]>=5&&suitBidCount(seat,mySuit)<3&&target.level>curLvlNow){
      const reb=sb(myLvl+1,mySuit); if(reb) return reb;
    }
    // 4. renk forcing durumuysa NT dene
    if(force){
      const nt=sb(3,'NT')||sb(2,'NT'); if(nt) return nt;
    }
  }

  // ── 5. PARTNER NT DEDİ — kendi rengimi teyit et ya da NT'de kal ──
  if(pSuit==='NT'){
    if(mySuit&&mySuit!=='NT'&&cnt[mySuit]>=5&&suitBidCount(seat,mySuit)<3){
      const lvl=target.level>=4?4:pLvl+1;
      const b=sb(lvl,mySuit); if(b) return b;
    }
  }

  // ── 6. FORCING İSE ASLA PAS — güvenli devam bul ───────────
  if(force){
    return forcedContinuation(seat, st, fitSuit||agreed, combined);
  }

  // ── 7. KENDİ UZUN RENGİMİ SON KEZ DENE (fit yoksa, hedef haklı çıkarıyorsa) ──
  if(mySuit&&mySuit!=='NT'&&cnt[mySuit]>=6&&suitBidCount(seat,mySuit)<3&&target.level>Math.max(myLvl,pLvl)){
    const b=sb(myLvl+1,mySuit); if(b) return b;
  }

  // ── 8. Hiçbir şey uymuyor — auction burada bitmeli ────────
  return{bid:'PASS'};
}

/* ════════════════════════════════════════════════════
   LOG + DISPLAY
════════════════════════════════════════════════════ */
function renderLog(){
  // Sütun sırası: dealer\u2019dan başlayarak saat yönünde
  const colSeats=[0,1,2,3].map(j=>SEAT[(dealerIdx+j)%4]);
  const names={N:'Kuzey',E:'Doğu',S:'Güney',W:'Batı'};

  // Başlık satırını yeniden yaz
  const head=el('logHead');
  if(head){
    head.innerHTML=colSeats.map((s,i)=>{
      const isDealer=i===0;
      const isUser=s==='N';
      return `<th style="${isUser?'color:var(--gold2)':''}">${names[s]}${isDealer?' ★':''}${isUser?' (Siz)':''}</th>`;
    }).join('');
  }

  // Satırları yaz — history sırası dealer\u2019dan başlar, j. sütun = colSeats[j]
  let rows='';
  for(let i=0;i<history.length;i+=4){
    rows+='<tr>';
    for(let j=0;j<4;j++){
      const e=history[i+j];
      const isYou=colSeats[j]==='N';
      rows+=`<td class="${isYou?'you-col':''}">${e?fmtBid(e):'—'}</td>`;
    }
    rows+='</tr>';
  }
  el('logBody').innerHTML=rows;
  const lw=document.querySelector('.log-wrap');
  lw.scrollTop=lw.scrollHeight;
}
function fmtBid(e){
  if(e.bid==='PASS')return'<span class="bpass">Pas</span>';
  if(e.isX)return'<span class="bc bdbl">X</span>';
  if(e.isXX)return'<span class="bc brdbl">XX</span>';
  const lvl=e.bid[0],rest=e.bid.slice(1),red=(rest==='♥'||rest==='♦');
  return`<span class="bc ${red?'bred':'bblk'}">${lvl}<span style="font-size:15px">${rest}</span></span>`;
}
function updateContractBar(){el('vCont').textContent=lastBidStr?(lastBidStr+(doubled?' X':'')+(redoubled?' XX':'')):'—';}

/* ════════════════════════════════════════════════════
   BIDDING CARD RENDER
════════════════════════════════════════════════════ */
function renderAll(showOpp){
  renderHand('N',true);    // North = user, always visible
  renderHand('S',showOpp); // South = AI partner, hidden during bidding
  if(biddingPracticeMode==='partner_only'){
    renderInactiveEW('E');
    renderInactiveEW('W');
    return;
  }
  renderEW('E',showOpp);
  renderEW('W',showOpp);
}

function renderInactiveEW(p){
  const c=el('h'+p);
  if(!c) return;
  c.innerHTML='<div style="color:var(--muted);font-size:12px;padding:18px 8px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(0,0,0,.18)">İhaleye katılmaz</div>';
}

function renderHand(p,vis){
  const c=el('h'+p);c.innerHTML='';
  hands[p].forEach(card=>{
    const div=document.createElement('div');
    if(!vis){div.className='card back';}
    else{div.className='card';const col=SUITS[card.s].col;div.innerHTML=`<div class="rank" style="color:${col}">${dr(card.r)}<span class="rsym">${SUITS[card.s].sym}</span></div><div class="sym" style="color:${col}">${SUITS[card.s].sym}</div>`;}
    c.appendChild(div);
  });
}

function renderEW(p,vis){
  const c=el('h'+p);c.innerHTML='';c.removeAttribute('style');
  if(!vis){
    const grid=document.createElement('div');
    grid.style.cssText='display:flex;flex-direction:column;gap:4px;align-items:center;';
    [7,6].forEach(count=>{
      const row=document.createElement('div');row.style.cssText='display:flex;position:relative;';
      for(let i=0;i<count;i++){const card=document.createElement('div');card.className='card back';card.style.cssText='width:60px;height:87px;margin-left:'+(i===0?'0':'-36px')+';';row.appendChild(card);}
      grid.appendChild(row);
    });
    c.appendChild(grid);
  } else {
    const fan=document.createElement('div');
    fan.style.cssText='display:flex;align-items:flex-start;justify-content:center;padding-left:44px;min-height:118px;';
    hands[p].forEach(card=>{
      const div=document.createElement('div');div.className='card';const col=SUITS[card.s].col;
      div.innerHTML=`<div class="rank" style="color:${col}">${dr(card.r)}<span class="rsym">${SUITS[card.s].sym}</span></div><div class="sym" style="color:${col}">${SUITS[card.s].sym}</div>`;
      fan.appendChild(div);
    });
    c.appendChild(fan);
  }
}

/* ════════════════════════════════════════════════════
   FINISH BIDDING
════════════════════════════════════════════════════ */
function finish(){
  gameOver=true;renderAll(false); // ihale bitti — sadece N açık kalmalı, diğerleri kapalı
  el('ctrl').style.display='none';el('thinking').style.display='none';
  const isBiddingPractice=!!biddingPracticeMode;
  if(isBiddingPractice){
    renderHand('N',true);
    renderHand('S',true);
    if(biddingPracticeMode==='partner_only'){
      renderInactiveEW('E');
      renderInactiveEW('W');
    }else{
      renderEW('E',true);
      renderEW('W',true);
    }
  }

  const stN=stats(hands.N),stS=stats(hands.S),stE=stats(hands.E),stW=stats(hands.W);
  const nsHcp=stN.hcp+stS.hcp,ewHcp=stE.hcp+stW.hcp;
  const fitNS=bestFit(hands.N,hands.S),fitEW=bestFit(hands.E,hands.W);
  const optNS=optCont(nsHcp,fitNS),optEW=optCont(ewHcp,fitEW);
  const fc=lastBidStr||(passCount>=4?'Pas':'—');
  const dblSfx=doubled?' X':redoubled?' XX':'';
  const isNSF=lastBidSeat==='S'||lastBidSeat==='N';
  const fsNS=SUITS[fitNS.suit]?SUITS[fitNS.suit].sym:fitNS.suit;
  const fsEW=SUITS[fitEW.suit]?SUITS[fitEW.suit].sym:fitEW.suit;

  let evalTxt='';
  if(!lastBidStr){evalTxt=nsHcp>=12?`Herkes pas geçti — NS <b>${nsHcp} HCP</b> ile açılış yapabilirdi. Önerilen: <span class="chip">${optNS.str}</span>`:'Herkes pas geçti — el zayıf, pas doğru.';}
  else if(isNSF){const fl=parseInt(fc[0])||0;if(fl<optNS.lvl-1)evalTxt=`<b>${fc}${dblSfx}</b> — çekingen. <span class="chip">${optNS.str}</span> hedeflenebilirdi.`;else if(fl>optNS.lvl)evalTxt=`<b>${fc}${dblSfx}</b> — iddialı. Güvenli hedef: <span class="chip">${optNS.str}</span>`;else evalTxt=`<b>${fc}${dblSfx}</b> — optimal seviyeye yakın.`;}
  else{evalTxt=`<b>${fc}${dblSfx}</b> — EW kontratı. Optimal EW: <span class="chip">${optEW.str}</span>. NS defans oynuyor.`;}

  el('anl').style.display='none';

  // Declarer preview hesapla
  (function(){
    const sSymF=lastBidStr?lastBidStr.slice(1):'';
    const decSideF=(lastBidSeat==='N'||lastBidSeat==='S')?['N','S']:['E','W'];
    let decF=lastBidSeat;
    for(const h of history){
      if(!decSideF.includes(h.seat)||h.bid==='PASS'||h.isX||h.isXX)continue;
      if(h.bid.slice(1)===sSymF){decF=h.seat;break;}
    }
    const dummyF=decF==='N'?'S':decF==='S'?'N':decF==='E'?'W':'E';
    const orderF=['N','E','S','W'];
    const diF=orderF.indexOf(decF);
    const defLF=orderF[(diF+3)%4];
    const cs=document.getElementById('contractSummary');
    if(cs) cs.innerHTML=
      `Oynayan: <b style="color:var(--gold2)">${seatName(decF)}</b> &nbsp;|&nbsp; `+
      `Dummy: <b>${seatName(dummyF)}</b> &nbsp;|&nbsp; `+
      `İlk Açılış: <b style="color:#e8a870">${seatName(defLF)}</b>`;
  })();
  // Eski buton barını sil, yenisini ekle
  const oldBar=document.getElementById('finishBar');
  if(oldBar) oldBar.remove();
  const bar=document.createElement('div');
  bar.id='finishBar';
  bar.style.cssText='display:flex;gap:8px;margin-top:8px;width:100%;';
  if(lastBidStr&&!isBiddingPractice){
    const pb=document.createElement('button');
    pb.style.cssText='flex:2;padding:11px;background:rgba(20,70,160,0.82);color:#b0d0ff;border:1px solid rgba(100,160,255,0.45);border-radius:8px;font-family:Playfair Display,serif;font-size:13px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;';
    pb.textContent='✦ Oyunu Oyna ✦';
    pb.onclick=function(){startPlay();};
    bar.appendChild(pb);
  }
  const nb=document.createElement('button');
  nb.style.cssText='flex:1;padding:11px;background:rgba(22,88,56,0.68);color:#e8c97a;border:1px solid rgba(201,168,76,0.38);border-radius:8px;font-family:Playfair Display,serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;';
  nb.textContent=isBiddingPractice?'✦ Yeni Deklere ✦':'✦ Sonraki El ✦';
  nb.onclick=function(){setAIDifficulty(aiDifficulty);
startGame();};
  bar.appendChild(nb);
  if(isBiddingPractice){
    const mb=document.createElement('button');
    mb.style.cssText='flex:1;padding:11px;background:rgba(40,40,40,0.72);color:var(--cream);border:1px solid rgba(255,255,255,0.14);border-radius:8px;font-family:Playfair Display,serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;';
    mb.textContent='Modlara Dön';
    mb.onclick=function(){
      biddingPracticeMode=null;
      el('bidWrap').style.display='none';
      el('infoBar').style.display='none';
      const online=el('onlineMode');if(online)online.classList.add('active');
    };
    bar.appendChild(mb);
  }
  el('anl').parentNode.insertBefore(bar, el('anl').nextSibling);
}

function bestFit(h1,h2){const c1=stats(h1).cnt,c2=stats(h2).cnt;let best={suit:'S',cnt:0};SK.forEach(s=>{const n=c1[s]+c2[s];if(n>best.cnt)best={suit:s,cnt:n};});return best;}
function optCont(hcp,fit){const fs=SUITS[fit.suit]?SUITS[fit.suit].sym:fit.suit;if(hcp>=37)return{str:'7NT',lvl:7};if(hcp>=33&&fit.cnt>=8)return{str:`6${fs}`,lvl:6};if(hcp>=33)return{str:'6NT',lvl:6};if(hcp>=30&&fit.cnt>=8)return{str:`6${fs}`,lvl:6};if(hcp>=26)return{str:'3NT',lvl:3};if(hcp>=25&&fit.cnt>=8)return{str:`4${fs}`,lvl:4};if(hcp>=22&&fit.cnt>=8)return{str:`3${fs}`,lvl:3};if(hcp>=18&&fit.cnt>=8)return{str:`2${fs}`,lvl:2};if(hcp>=12)return{str:'1NT',lvl:1};return{str:'Pas',lvl:0};}
function altList(hcp,fit){const fs=SUITS[fit.suit]?SUITS[fit.suit].sym:fit.suit;const a=[];if(hcp>=37)a.push(['7NT','Grand Slam']);if(hcp>=33&&fit.cnt>=8)a.push([`6${fs}`,'Small Slam majörde']);else if(hcp>=33)a.push(['6NT','Small Slam NT']);if(hcp>=30&&hcp<33&&fit.cnt>=8)a.push([`6${fs}`,'Slam bölgesi']);if(hcp>=26)a.push(['3NT','Oyun eli NT']);if(hcp>=25&&fit.cnt>=8)a.push([`4${fs}`,'Majör oyun eli']);if(hcp>=22&&hcp<25&&fit.cnt>=8)a.push([`3${fs}`,'Limit raise']);if(hcp>=18&&hcp<22&&fit.cnt>=8)a.push([`2${fs}`,'Partscore']);if(hcp>=12&&hcp<18)a.push(['1NT','Min açılış']);if(hcp<12)a.push(['Pas','Zayıf el']);if(!a.length)a.push(['Pas','Güç yok']);return a.slice(0,4).map(([c,w])=>`<span class="chip">${c}</span> <span style="color:var(--muted);font-size:11px">${w}</span>`).join('<br>');}
function advice(nsHcp,ewHcp,fitNS,fitEW,optNS,optEW){const l=[];const fsNS=SUITS[fitNS.suit]?SUITS[fitNS.suit].sym:fitNS.suit;if(nsHcp>=33)l.push(`NS eli Slam gücünde (${nsHcp} HCP). Blackwood ile as sayısı sorgulanmalıydı. Optimal: <span class="chip">${optNS.str}</span>`);else if(nsHcp>=25)l.push(`NS ${nsHcp} HCP — oyun bölgesi. Hedef: <span class="chip">${optNS.str}</span>`);else if(ewHcp>nsHcp&&ewHcp>=20)l.push(`EW daha güçlü (${ewHcp} HCP). NS defansa odaklanmalı.`);else l.push(`Dengeli el. NS:${nsHcp}, EW:${ewHcp} HCP. Partscore mücadelesi.`);if(fitNS.cnt>=9)l.push(`NS ${fitNS.cnt}× ${fsNS} fiti ile koz avantajı.`);else if(fitNS.cnt>=8)l.push(`8 kartlık ${fsNS} fiti var — kozda oynamak NT\u2019den güvenli.`);else l.push(`NS\u2019de güçlü fit yok (${fitNS.cnt}× ${fsNS}) — NT tercih edilmeli.`);if(doubled)l.push('Kontr yapıldı — alt düşerse rakip bonus alır, yapılırsa iki kat puan.');if(redoubled)l.push('Surkontr — risk ve ödül dört kat.');return l.join('<br>');}


/* ══════════════════════════════════════════════════════════════
   SLAM CONVENTIONS — BLACKWOOD / RKCB 1430 / KING ASK
   Default: Roman Key Card Blackwood 1430.
   4NT is RKCB only when a trump suit has been established or
   strongly implied. Otherwise 4NT remains quantitative.
══════════════════════════════════════════════════════════════ */

function countAces(hand){ return hand.filter(c=>c.r==='A').length; }
function countKings(hand){ return hand.filter(c=>c.r==='K').length; }
function countKeyCards(hand, trump){
  // 4 aces + trump king. If trump is not known, RKCB is not used.
  let n=countAces(hand);
  if(trump && hand.some(c=>c.s===trump && c.r==='K')) n++;
  return n;
}

// Find the trump suit associated with a particular 4NT bid.
// We accept either explicit agreement (both partners bid the suit) or
// a strong implied major fit (partner bid the major and asker has 4+).
function rkcbSuitForEntry(entry){
  if(!entry || entry.bid!=='4NT') return null;
  const idx=history.indexOf(entry);
  if(idx<0) return null;
  const asker=entry.seat;
  const partner=partnerOf(asker);
  const before=history.slice(0,idx).filter(x=>x.bid!=='PASS'&&!x.isX&&!x.isXX);
  const askerSuits=before.filter(x=>x.seat===asker).map(x=>suitOf(x.bid)).filter(s=>s&&s!=='NT');
  const partnerSuits=before.filter(x=>x.seat===partner).map(x=>suitOf(x.bid)).filter(s=>s&&s!=='NT');

  // Explicit agreement: both partners have bid the same suit.
  for(const su of partnerSuits){ if(askerSuits.includes(su)) return su; }

  // Implied major fit: partner has shown a major and asker has 4+ cards.
  const h=hands[asker]||[];
  for(const su of ['S','H']){
    if(partnerSuits.includes(su) && h.filter(c=>c.s===su).length>=4) return su;
  }
  return null;
}

function isRKCB4NT(entry){ return !!rkcbSuitForEntry(entry); }

function lastBlackwood(){
  for(let i=history.length-1;i>=0;i--){
    const e=history[i];
    if(e.bid==='4NT' && isRKCB4NT(e)) return e;
  }
  return null;
}

function lastFiveNT(){
  const bw=lastBlackwood(); if(!bw) return null;
  const idx=history.indexOf(bw);
  for(let i=idx+1;i<history.length;i++) if(history[i].bid==='5NT') return history[i];
  return null;
}

function blackwoodAnswered(){
  const bw=lastBlackwood(); if(!bw) return false;
  const idx=history.indexOf(bw);
  for(let i=idx+1;i<history.length;i++){
    const b=history[i];
    if(b.bid!=='PASS'&&!b.isX&&!b.isXX){
      const lvl=parseInt(b.bid[0]);
      if(lvl===5) return true;
    }
  }
  return false;
}

function mustAnswerBlackwood(seat){
  const bw=lastBlackwood(); if(!bw || blackwoodAnswered()) return false;
  return seat===partnerOf(bw.seat);
}

function mustAnswerFiveNT(seat){
  const fn=lastFiveNT(); if(!fn) return false;
  const idx=history.indexOf(fn);
  for(let i=idx+1;i<history.length;i++){
    const b=history[i];
    if(b.bid!=='PASS'&&!b.isX&&!b.isXX) return false;
  }
  return seat===partnerOf(fn.seat);
}

// RKCB 1430:
// 5C = 1 or 4 key cards
// 5D = 0 or 3 key cards
// 5H = 2 key cards, trump Q absent
// 5S = 2 key cards, trump Q present
function blackwoodResponse(seat){
  const bw=lastBlackwood();
  const trump=bw ? rkcbSuitForEntry(bw) : null;
  if(!trump) return {bid:'PASS'};
  const keys=countKeyCards(hands[seat],trump);
  const q=hands[seat].some(c=>c.s===trump&&c.r==='Q');
  const response = keys===1||keys===4 ? 'C' : keys===0||keys===3 ? 'D' : q ? 'S' : 'H';
  return safeBid(5,response)||{bid:'PASS'};
}

// 5NT after RKCB asks for specific side-suit kings.
// The trump king is already a key card and is therefore excluded.
function fiveNTResponse(seat){
  const bw=lastBlackwood();
  const trump=bw ? rkcbSuitForEntry(bw) : null;
  if(!trump) return {bid:'PASS'};

  // Specific King Ask (SKA): show the cheapest non-trump King held.
  // The trump King is already one of the five Key Cards and is never shown again.
  const kingOrder=['C','D','H','S'];
  for(const su of kingOrder){
    if(su!==trump && hands[seat].some(c=>c.s===su&&c.r==='K')){
      return safeBid(6,su)||{bid:'PASS'};
    }
  }
  // No side-suit King: return to 6 of the agreed trump.
  return safeBid(6,trump)||{bid:'PASS'};
}

function shouldAsk4NT(seat, st, agreed){
  if(lastBlackwood()) return false;
  if(!agreed || agreed==='NT') return false;
  if(st.hcp<16) return false;
  if(lastBidVal>=bval(4,agreed)) return false;
  return true;
}

function rkcbResponseInfo(responseBid){
  const s=suitOf(responseBid);
  if(s==='C') return {min:1,max:4,ambiguous:true};
  if(s==='D') return {min:0,max:3,ambiguous:true};
  if(s==='H') return {min:2,max:2,queen:false};
  if(s==='S') return {min:2,max:2,queen:true};
  return null;
}

// After RKCB response, continue the auction conservatively.
// 5NT is used as the king/clarification ask when the key-card count
// is ambiguous and the asker has enough key cards to make clarification useful.
function afterBlackwood(seat, agreed){
  const bw=lastBlackwood(); if(!bw) return null;
  const trump=rkcbSuitForEntry(bw); if(!trump) return null;
  const bwIdx=history.indexOf(bw);
  let responseEntry=null;
  for(let i=bwIdx+1;i<history.length;i++){
    const b=history[i];
    if(b.bid!=='PASS'&&!b.isX&&!b.isXX&&parseInt(b.bid[0])===5){ responseEntry=b; break; }
  }
  if(!responseEntry) return null;

  const info=rkcbResponseInfo(responseEntry.bid);
  const myHand=hands[seat]||[];
  const myKeys=countKeyCards(myHand,trump);
  const myAces=countAces(myHand);
  const myKeyTotalMin=myKeys+(info?info.min:0);
  const myKeyTotalMax=myKeys+(info?info.max:0);
  const sb=(l,s)=>safeBid(l,s);

  // 5NT is a Specific King Ask (SKA), not a generic clarification ask.
  // It is only valid when the partnership is known to hold all five Key Cards
  // and the trump Queen (or an equivalent confirmed control) and therefore has
  // a genuine grand-slam interest. Do not use it merely to resolve 5C/5D ambiguity.
  const trumpQ=myHand.some(c=>c.s===trump&&c.r==='Q');
  const guaranteedFive = info && !info.ambiguous && (myKeyTotalMin===5 || myKeyTotalMax===5)
    ? (myKeyTotalMin===5 && myKeyTotalMax===5) : false;
  if(guaranteedFive && trumpQ){
    return sb(5,'NT')||null;
  }

  // For 5C/5D ambiguity, prefer the agreed suit or a conservative slam decision;
  // do not turn 5NT into a second Key Card ask.

  // 2+ key cards plus a known queen / 3+ total keys: small slam is reasonable.
  if(myKeyTotalMin>=5) return sb(7,trump)||{bid:'PASS'};
  if(myKeyTotalMin>=4) return sb(6,trump)||{bid:'PASS'};

  // If only 3 total key cards are known, stop at five of the trump.
  if(myKeyTotalMax>=3) return sb(5,trump)||{bid:'PASS'};
  return {bid:'PASS'};
}

/* ════════════════════════════════════════════════════
   PLAY PHASE
════════════════════════════════════════════════════ */
function seatName(s){return{N:'Kuzey',E:'Doğu',S:'Güney',W:'Batı'}[s]||s;}
// KURAL:
// - NS oynuyorsa (declarer N veya S): N ve S ikisi de AÇIK, ikisini de N (gerçek oyuncu) manuel oynar.
// - EW oynuyorsa (declarer E veya W): sadece N (gerçek oyuncu eli) + dummy (E/W'nin karşı tarafı,
//   açılış atağından sonra) açık. S, E, W'nin declarer olanı KAPALI — hepsini AI oynar.
function isHuman(s){
  const decNS=declarer==='N'||declarer==='S';
  if(decNS) return s==='N'||s==='S'; // N, her iki NS elini de manuel oynar
  return s==='N'; // EW oynuyorsa sadece N'in kendi eli insan kontrollü
}
let forceRevealAll=false; // oyun bitince "Tüm Elleri Göster" ile true olur
function isHandVisible(s){
  if(forceRevealAll) return true; // oyun sonrası inceleme modu
  if(s==='N') return true; // her zaman görünür
  const decNS=declarer==='N'||declarer==='S';
  if(decNS) return s==='S'; // NS oynuyorsa S de her zaman açık
  // EW oynuyorsa: sadece dummy (E/W'nin declarer olmayanı), açılış atağından sonra
  if(s===dummy && (trickCount>0||currentTrick.length>0)) return true;
  return false;
}
function revealAllHands(){
  forceRevealAll=true;
  renderPlay();
}
const RV2=r=>['2','3','4','5','6','7','8','9','T','J','Q','K','A'].indexOf(r);

function startPlay(){
  if(!lastBidStr){console.error('startPlay: no lastBidStr');return;}
  const suitSym=lastBidStr.slice(1);
  trump=suitSym==='NT'?null:(SK.find(s=>SUITS[s].sym===suitSym)||null);
  contractLevel=parseInt(lastBidStr[0])||1;

  // Find true declarer: first player on winning side to name the trump strain
  const decSide=(lastBidSeat==='N'||lastBidSeat==='S')?['N','S']:['E','W'];
  declarer=lastBidSeat; // default: whoever made the final bid
  // Search from beginning: first mention of this suit/NT by winning side
  for(const h of history){
    if(!decSide.includes(h.seat)||h.bid==='PASS'||h.isX||h.isXX) continue;
    const hSuit=h.bid.slice(1); // NT or ♠/♥/♦/♣
    if(hSuit===suitSym){ declarer=h.seat; break; }
  }
  if(!decSide.includes(declarer)) declarer=lastBidSeat;
  dummy=declarer==='N'?'S':declarer==='S'?'N':declarer==='E'?'W':'E';

  // Opening lead: player to LEFT of declarer
  // Clockwise: N→E→S→W. Physical left = one step back = (di+3)%4
  // Example: declarer=S(idx2) → left=E(idx1) → E leads ✓
  // Example: declarer=N(idx0) → left=W(idx3) → W leads ✓
  const order=['N','E','S','W'];
  const di=order.indexOf(declarer);
  // Açılış = Declarer\u2019ın FİZİKSEL SOLUNDAN başlar
  // Masa: N=üst, E=sağ, S=alt, W=sol
  // S\u2019nin solu=E, N\u2019nin solu=W, E\u2019nin solu=N, W\u2019nin solu=S
  // Formül: (di+3)%4
  // K oynuyor → D açar, saat yönünde bir sonraki = (di+1)%4
  defL=order[(di+1)%4]; // açılış yapan = saat yönünde sonraki
  defR=order[(di+3)%4]; // diğer savunmacı

  currentTrick=[];currentTrickSeat=defL;
  tricksDeclarer=0;tricksDefenders=0;trickCount=0;ledSuit=null;playHistory=[];
  playHands={};Object.keys(hands).forEach(p=>{playHands[p]=hands[p].map(c=>({...c}));});
  playActive=true;

  el('bidWrap').style.display='none';
  el('playWrap').classList.add('active');
  el('scoreBar').classList.remove('active');
  const bep2=el('bidExplain');if(bep2)bep2.style.display='none';

  // Show play info banner
  const banner=document.getElementById('playBanner');
  if(banner){
    const trumpStr=trump?SUITS[trump].sym:'NT';
    const decNS2=declarer==='N'||declarer==='S';
    banner.innerHTML=
      `<b style="color:var(--gold2)">${seatName(declarer)}</b> oynuyor `+
      `<span style="color:${decNS2?'#7dd87d':'#e07070'}">(${decNS2?'NS':'EW'})</span>`+
      ` &nbsp;|&nbsp; Koz: <b style="color:var(--gold2)">${trumpStr}</b>`+
      ` &nbsp;|&nbsp; Açılış: <b>${seatName(defL)}</b>`+
      ` &nbsp;|&nbsp; Dummy: <b>${seatName(dummy)}</b>`;
    banner.style.display='block';
  }
  renderPlay();
  if(!isHuman(currentTrickSeat))setTimeout(aiPlay,700);
}

/* ── RENDER PLAY — S=üst, W=sol, E=sağ, N=alt (sabit) ── */
function renderPlay(){
  try{
    const decNS=declarer==='N'||declarer==='S';

    // Sabit pozisyon label\u2019ları güncelle
    function setLbl(id,seat){
      const lbl=el(id); if(!lbl)return;
      const isDecl=seat===declarer;
      const isDummy=seat===dummy;
      const isOpenLead=seat===defL&&trickCount===0&&currentTrick.length===0;
      const isActive=currentTrickSeat===seat;
      let role='';
      if(isDecl) role=' ★ Oynayan';
      else if(isDummy) role=' (Dummy)';
      else if(isOpenLead) role=' ← Açılış';
      const nameCol=isDecl?'var(--gold2)':isDummy?'#a0c8ff':'var(--cream)';
      lbl.innerHTML=`<span style="color:${nameCol}">${seatName(seat)}${seat==='N'?' (Siz)':''}</span>`+
        `<span style="color:${isDecl?'var(--gold2)':'var(--muted)'};font-size:10px;margin-left:4px">${role}</span>`;
      lbl.classList.toggle('active-turn',isActive);
    }
    setLbl('pLblS','S');
    setLbl('pLblW','W');
    setLbl('pLblE','E');
    setLbl('pLblN','N');

    // Elleri render et — sabit pozisyonlarda
    renderPHand('ph-N','N');
    renderPHand('ph-S','S');
    renderPSide('ph-W-play','W');
    renderPSide('ph-E-play','E');

    // Kazanılan el sayıları
    const nsTr=decNS?tricksDeclarer:tricksDefenders;
    const ewTr=decNS?tricksDefenders:tricksDeclarer;
    const tcN=el('tc-N');const tcS=el('tc-S');
    const tcW=el('tc-W');const tcE=el('tc-E');
    // Oynayan tarafın sayısını göster
    if(tcS) tcS.textContent=decNS?'NS kazanılan: '+nsTr:'NS kazanılan: '+nsTr;
    if(tcN) tcN.textContent='';
    if(tcW) tcW.textContent=!decNS?'EW kazanılan: '+ewTr:'EW kazanılan: '+ewTr;
    if(tcE) tcE.textContent='';

    renderTrick();
    updateContractInfo();
  }catch(err){
    console.error('renderPlay:',err);
    const tc=el('trickCenter');
    if(tc)tc.innerHTML='<div style="color:#e05252;font-size:12px;padding:10px">Hata: '+err.message+'</div>';
  }
}

/* Horizontal suit-sorted hand (N / S sabit pozisyon) */
function renderPHand(cid,seat){
  const c=el(cid);c.innerHTML='';
  // Oyun bitip "Tüm Elleri Göster" basıldıysa orijinal 13 kartlık eli göster
  // (playHands oyun sırasında tükenmiş olur, hands ise dokunulmamış orijinal dağıtımdır)
  const h = forceRevealAll ? (hands[seat]||[]) : playHands[seat];
  if(!h||!h.length){c.innerHTML='<div style="color:var(--muted);font-size:11px;padding:6px">El bitti</div>';return;}
  const visible=isHandVisible(seat);
  const isTurn=currentTrickSeat===seat && !forceRevealAll;
  const row=document.createElement('div');
  row.style.cssText='display:flex;align-items:flex-start;position:relative;padding-left:40px;min-height:87px;';
  if(!visible){
    // Kapalı el — sadece kart sayısı kadar arka yüz göster
    h.forEach((_,i)=>{
      const div=document.createElement('div');
      div.className='pc back-p';
      div.style.zIndex=i+1;
      row.appendChild(div);
    });
    c.appendChild(row);
    return;
  }
  h.forEach((card,i)=>{
    const legal=isTurn&&isHuman(seat)&&isLegal(seat,card);
    const div=mkPCard(card,legal,i);
    if(legal)div.onclick=()=>humanPlay(seat,card);
    row.appendChild(div);
  });
  c.appendChild(row);
}

/* Vertical suit-sorted hand (W / E sabit pozisyon) */
function renderPSide(cid,seat){
  const c=el(cid);c.innerHTML='';
  const h = forceRevealAll ? (hands[seat]||[]) : playHands[seat];
  if(!h||!h.length){c.innerHTML='<div style="color:var(--muted);font-size:11px;padding:4px">El bitti</div>';return;}
  const visible=isHandVisible(seat);
  const isTurn=currentTrickSeat===seat && !forceRevealAll;
  if(!visible){
    // Kapalı el — 7+6 grid arka yüz
    const grid=document.createElement('div');
    grid.style.cssText='display:flex;flex-direction:column;gap:4px;align-items:center;';
    const counts=[Math.ceil(h.length/2),Math.floor(h.length/2)];
    let idx=0;
    counts.forEach(cnt=>{
      if(cnt<=0)return;
      const row=document.createElement('div');row.style.cssText='display:flex;position:relative;';
      for(let i=0;i<cnt;i++){
        const div=document.createElement('div');
        div.className='pc back-p';
        div.style.cssText+='width:50px;height:72px;';
        row.appendChild(div);
        idx++;
      }
      grid.appendChild(row);
    });
    c.appendChild(grid);
    return;
  }
  SK.forEach(suit=>{
    const sc=h.filter(x=>x.s===suit);if(!sc.length)return;
    const row=document.createElement('div');row.className='side-suit-row-p';
    sc.forEach((card,i)=>{
      const legal=isTurn&&isHuman(seat)&&isLegal(seat,card);
      const div=mkPCard(card,legal,i);div.style.width='50px';div.style.height='72px';
      if(legal)div.onclick=()=>humanPlay(seat,card);
      row.appendChild(div);
    });
    c.appendChild(row);
  });
}

function mkPCard(card,playable,idx){
  const div=document.createElement('div');
  div.className='pc'+(playable?' playable':'');
  div.style.zIndex=idx+1;
  const col=SUITS[card.s].col;
  const sym=SUITS[card.s].sym;
  const r=dr(card.r);
  div.innerHTML=
    `<div class="pr2" style="color:${col}"><span class="prr">${r}</span><span class="prs">${sym}</span></div>`+
    `<div class="pc-mid" style="color:${col};opacity:0.55">${sym}</div>`+
    `<div class="pr2b" style="color:${col}"><span class="prr">${r}</span><span class="prs">${sym}</span></div>`;
  return div;
}

/* ── TRICK CENTER ── */
function renderTrick(){
  const tc=el('trickCenter');
  if(!tc) return;
  tc.innerHTML='';
  // Won trick stacks
  const mkStack=(count,cssPos,label)=>{
    const div=document.createElement('div');
    div.style.cssText='position:absolute;display:flex;align-items:center;gap:3px;'+cssPos;
    div.innerHTML=`<span style="font-size:10px;color:var(--gold);font-family:'Playfair Display',serif">${label}: ${count}</span>`;
    for(let i=0;i<Math.min(count,8);i++){const m=document.createElement('div');m.className='trick-mini';m.style.marginLeft=i?'-16px':'0';m.style.zIndex=i+1;m.style.position='relative';div.appendChild(m);}
    return div;
  };
  const decNSt=declarer==='N'||declarer==='S';
  tc.appendChild(mkStack(decNSt?tricksDeclarer:tricksDefenders,'bottom:4px;left:4px;','NS'));
  tc.appendChild(mkStack(decNSt?tricksDefenders:tricksDeclarer,'top:4px;right:4px;','EW'));

  // Played cards this trick
  // Fixed positions: S=top(tN), N=bottom(tS), W=left(tW), E=right(tE)
  const posMap={'S':'tN','N':'tS','W':'tW','E':'tE'};
  currentTrick.forEach(({seat,card})=>{
    const div=document.createElement('div');
    div.className='tcard '+(posMap[seat]||'tN');
    const col=SUITS[card.s].col;
    const sym2=SUITS[card.s].sym; const r2=dr(card.r);
    div.innerHTML=
      `<div style="font-size:13px;font-family:'Playfair Display',serif;font-weight:700;line-height:1.3;color:${col}">${r2}<br><span style="font-size:17px">${sym2}</span></div>`+
      `<div style="font-size:24px;text-align:center;color:${col};opacity:.55;line-height:1">${sym2}</div>`+
      `<div style="font-size:13px;font-family:'Playfair Display',serif;font-weight:700;line-height:1.3;color:${col};transform:rotate(180deg);text-align:left">${r2}<br><span style="font-size:17px">${sym2}</span></div>`;
    tc.appendChild(div);
  });

  // Turn indicator text
  if(trickCount<13){
    const ind=document.createElement('div');
    ind.style.cssText='position:absolute;bottom:46%;left:50%;transform:translateX(-50%);font-size:10px;color:var(--gold2);font-family:"Playfair Display",serif;letter-spacing:1px;opacity:.8;white-space:nowrap;';
    ind.textContent=seatName(currentTrickSeat)+(isHuman(currentTrickSeat)?' — Sıranız':'');
    tc.appendChild(ind);
  }
}

/* ── LEGAL PLAY ── */
function isLegal(seat,card){
  if(currentTrick.length===0)return true;
  if(!ledSuit)return true;
  const hasLed=playHands[seat].some(c=>c.s===ledSuit);
  return hasLed?card.s===ledSuit:true;
}

/* ── HUMAN PLAYS ── */
function humanPlay(seat,card){
  if(!playActive) return;
  if(currentTrickSeat!==seat) return;
  if(!isHuman(seat)) return;
  if(!isLegal(seat,card)) return;
  playCard(seat,card);
}

/* ── PLAY A CARD ── */
function playCard(seat,card){
  const idx=playHands[seat].findIndex(c=>c.r===card.r&&c.s===card.s);
  if(idx===-1)return;
  playHands[seat].splice(idx,1);
  if(currentTrick.length===0)ledSuit=card.s;
  currentTrick.push({seat,card});
  playHistory.push({trick:trickCount+1,seat,card:{...card}});
  const order=['N','E','S','W'];
  currentTrickSeat=order[(order.indexOf(seat)+1)%4];
  renderPlay();
  if(currentTrick.length===4)setTimeout(evalTrick,750);
  else if(!isHuman(currentTrickSeat))setTimeout(aiPlay,550);
}

/* ── EVALUATE TRICK ── */
function evalTrick(){
  const winner=trickWinner(currentTrick);
  const decl=declarer; // anlık kopya
  const decNS2=decl==='N'||decl==='S';
  const winnerIsNS=(winner==='N'||winner==='S');
  const winnerOnDeclarerSide=decNS2?winnerIsNS:!winnerIsNS;
  if(winnerOnDeclarerSide)tricksDeclarer++;else tricksDefenders++;
  trickCount++;currentTrick=[];ledSuit=null;currentTrickSeat=winner;
  renderPlay();
  if(trickCount>=13){setTimeout(endPlay,600);return;}
  if(!isHuman(currentTrickSeat))setTimeout(aiPlay,650);
}

function trickWinner(trick){
  let best=trick[0];
  trick.forEach(({seat,card})=>{if(cardBeats(card,best.card))best={seat,card};});
  return best.seat;
}
function cardBeats(card,vs){
  if(trump){if(card.s===trump&&vs.s!==trump)return true;if(card.s!==trump&&vs.s===trump)return false;}
  if(card.s===vs.s)return RV2(card.r)>RV2(vs.r);
  return false;
}

/* ── AI PLAY ── */
function aiPlay(){
  if(!playActive) return;
  const seat=currentTrickSeat;
  if(isHuman(seat)) return;
  const h=playHands[seat];
  if(!h||!h.length) return;
  try{
    playCard(seat,chooseCard(seat,h));
  }catch(e){
    console.error('aiPlay error:',e.message);
    // En basit legal kartı oyna
    const legal=h.filter(cv=>isLegal(seat,cv));
    if(legal.length) playCard(seat,legal[0]);
  }
}

/* ══════════════════════════════════════════════════════════════
   DOUBLE-DUMMY SOLVER — Minimax + Alpha-Beta + Kart Denklik Sınıfları
   Elde ≤7 kart kaldığında TÜM olası oyun ağacını arayıp kesin en
   iyi hamleyi bulur (profesyonel briç motorlarının temel mantığı).
   Performans için:
   - Denk kartlar (aynı sekanstaki, sonucu değiştirmeyen kartlar)
     tek hamle olarak denenir — dallanma çarpıcı şekilde azalır.
   - Node/süre bütçesi aşılırsa güvenle sezgisel oyuna (chooseCard
     içindeki mevcut kurallara) geri döner — ASLA yanlış/yarım
     sonuç kullanılmaz, sadece bazen "en optimal değil, iyi" olur.
══════════════════════════════════════════════════════════════ */
const DD_MAX_CARDS=7;       // bu kadar veya az kart kaldığında kesin çözüm denenir
const DD_MAX_NODES=200000;  // node bütçesi (güvenlik sınırı)
const DD_MAX_MS=600;        // zaman bütçesi ms (güvenlik sınırı)
const RANK_BY_VAL=['2','3','4','5','6','7','8','9','T','J','Q','K','A'];

// seat'in suit bazında "denk" (sonuç değiştirmeyen) kartlarını gruplar,
// her grup için sadece TEK temsilci kart döndürür → dallanma azalır
function ddEquivalentMoves(seat, legalCards, handsState){
  const bySuit={};
  legalCards.forEach(c=>{(bySuit[c.s]=bySuit[c.s]||[]).push(c);});
  const reps=[];
  Object.keys(bySuit).forEach(suit=>{
    const mine=bySuit[suit].slice().sort((a,b)=>RV2(b.r)-RV2(a.r));
    const live=new Set();
    ['N','E','S','W'].forEach(sk=>{
      handsState[sk].forEach(c=>{ if(c.s===suit) live.add(c.r); });
    });
    let i=0;
    while(i<mine.length){
      let j=i;
      while(j+1<mine.length){
        const hiV=RV2(mine[j].r), loV=RV2(mine[j+1].r);
        let clean=true;
        for(let v=loV+1; v<hiV; v++){
          if(live.has(RANK_BY_VAL[v])){ clean=false; break; }
        }
        if(clean) j++; else break;
      }
      reps.push(mine[i]); // grubun en yükseği temsilci
      i=j+1;
    }
  });
  return reps;
}

function ddIsLegal(seat,card,handsState,trick,ledSuitDD){
  if(trick.length===0) return true;
  if(!ledSuitDD) return true;
  const hasLed=handsState[seat].some(c=>c.s===ledSuitDD);
  return hasLed?card.s===ledSuitDD:true;
}

function ddApplyMove(state, seat, card){
  const newHands={N:state.hands.N,E:state.hands.E,S:state.hands.S,W:state.hands.W};
  newHands[seat]=state.hands[seat].filter(c=>!(c.r===card.r&&c.s===card.s));
  let ledSuitDD=state.ledSuitDD;
  if(state.trick.length===0) ledSuitDD=card.s; // trick'in ilk kartıysa led suit belirlenir
  const newTrick=state.trick.concat([{seat,card}]);
  let turn, tricksDec=state.tricksDec, tricksDef=state.tricksDef, trick=newTrick;
  if(newTrick.length===4){
    const winner=trickWinner(newTrick);
    const winSide=(winner===declarer||winner===dummy)?'dec':'def';
    if(winSide==='dec') tricksDec++; else tricksDef++;
    turn=winner; trick=[]; ledSuitDD=null;
  } else {
    const order=['N','E','S','W'];
    turn=order[(order.indexOf(seat)+1)%4];
  }
  return {hands:newHands, trick, turn, tricksDec, tricksDef, ledSuitDD};
}

function ddSearch(state, budget, alpha, beta){
  budget.nodes++;
  if(budget.nodes>budget.maxNodes){ budget.aborted=true; return 0; }
  if(budget.nodes%1000===0 && Date.now()-budget.start>budget.maxMs){ budget.aborted=true; return 0; }
  if(state.hands.N.length===0 && state.trick.length===0) return state.tricksDec;

  const seat=state.turn;
  const isDecSide=(seat===declarer||seat===dummy);
  const legal=state.hands[seat].filter(c=>ddIsLegal(seat,c,state.hands,state.trick,state.ledSuitDD));
  const moves=ddEquivalentMoves(seat, legal, state.hands);

  let best=isDecSide?-Infinity:Infinity;
  for(const card of moves){
    const child=ddApplyMove(state, seat, card);
    const val=ddSearch(child, budget, alpha, beta);
    if(budget.aborted) return best;
    if(isDecSide){ if(val>best) best=val; if(best>alpha) alpha=best; }
    else { if(val<best) best=val; if(best<beta) beta=best; }
    if(beta<=alpha) break; // alpha-beta budama
  }
  return best;
}

// Kök seviye: seat için KESİN en iyi hamleyi bulur.
// Bütçe aşılırsa veya hata olursa null döner (chooseCard sezgisel devam eder).
function ddGetBestMove(seat){
  try{
    const totalRemaining=playHands[seat].length;
    if(totalRemaining>DD_MAX_CARDS || totalRemaining===0) return null;

    const budget={nodes:0,maxNodes:DD_MAX_NODES,maxMs:DD_MAX_MS,start:Date.now(),aborted:false};
    const state0={
      hands:{N:playHands.N.slice(),E:playHands.E.slice(),S:playHands.S.slice(),W:playHands.W.slice()},
      trick:currentTrick.map(x=>({seat:x.seat,card:x.card})),
      turn:seat, tricksDec:0, tricksDef:0,
      ledSuitDD: currentTrick.length? currentTrick[0].card.s : null
    };
    const legal=state0.hands[seat].filter(c=>ddIsLegal(seat,c,state0.hands,state0.trick,state0.ledSuitDD));
    const rootMoves=ddEquivalentMoves(seat, legal, state0.hands);
    if(rootMoves.length===0) return null;
    if(rootMoves.length===1) return rootMoves[0]; // tek seçenek — arama gereksiz

    const isDecSide=(seat===declarer||seat===dummy);
    let bestMove=null, bestScore=isDecSide?-Infinity:Infinity;
    let alpha=-Infinity, beta=Infinity;

    for(const card of rootMoves){
      const child=ddApplyMove(state0, seat, card);
      const val=ddSearch(child, budget, alpha, beta);
      if(budget.aborted) return null; // yarım kalan sonucu ASLA kullanma
      if(isDecSide){
        if(val>bestScore){bestScore=val; bestMove=card;}
        if(bestScore>alpha) alpha=bestScore;
      } else {
        if(val<bestScore){bestScore=val; bestMove=card;}
        if(bestScore<beta) beta=bestScore;
      }
    }
    return bestMove;
  }catch(e){
    console.error('ddGetBestMove hata:',e.message);
    return null;
  }
}

function suitPlayedCount(suit){
  return playHistory.reduce((n,e)=>n+(e.card.s===suit?1:0),0);
}
function partnerRemainingCount(partner,suit){
  return (playHands[partner]||[]).filter(c=>c.s===suit).length;
}
function previousTrick(){
  if(trickCount===0) return [];
  const arr=playHistory.filter(e=>e.trick===trickCount);
  return arr.length===4?arr:[];
}
function previousTrickWinner(trick){
  if(!trick.length) return null;
  return trickWinner(trick.map(e=>({seat:e.seat,card:e.card})));
}
function chooseSubsequentDefenderLead(seat,legal){
  if(!legal.length) return null;
  const partner=seat===defL?defR:defL;
  const prev=previousTrick();
  const prevWinner=previousTrickWinner(prev);
  const nonTrump=trump?legal.filter(c=>c.s!==trump):legal.slice();
  const pool=nonTrump.length?nonTrump:legal.slice();

  // First priority: return partner's suit when partner won the previous trick.
  // This is a conservative standard-defence heuristic, not a convention claim.
  if(prevWinner===partner){
    const winnerCard=prev.find(e=>e.seat===partner)?.card;
    if(winnerCard){
      const back=pool.filter(c=>c.s===winnerCard.s);
      if(back.length){
        const seq=back.slice().sort((a,b)=>RV2(b.r)-RV2(a.r));
        if(seq.length>=2 && RV2(seq[0].r)-RV2(seq[1].r)<=2) return seq[0];
        if(seq.length>=4) return seq[seq.length-4]||seq[seq.length-1];
        return seq[seq.length-1];
      }
    }
  }

  // Second priority: lead the suit in which partner has the most known
  // remaining cards, avoiding trump. This uses actual card information,
  // not an invented signal convention.
  const scored=pool.map(c=>({c,n:partnerRemainingCount(partner,c.s),mine:playHands[seat].filter(x=>x.s===c.s).length}));
  scored.sort((a,b)=>b.n-a.n || b.mine-a.mine || RV2(a.c.r)-RV2(b.c.r));
  if(scored.length){
    const s=scored[0].c.s;
    const cards=pool.filter(c=>c.s===s).sort((a,b)=>RV2(b.r)-RV2(a.r));
    if(cards.length>=4) return cards[cards.length-4]||cards[cards.length-1];
    if(cards.length>=2 && RV2(cards[0].r)-RV2(cards[1].r)<=2) return cards[0];
    return cards[cards.length-1];
  }
  return null;
}
function chooseDefensiveDiscard(seat,legal,partner){
  const nonTrump=trump?legal.filter(c=>c.s!==trump):legal.slice();
  if(!nonTrump.length) return legal.slice().sort((a,b)=>RV2(a.r)-RV2(b.r))[0];
  const groups={};
  nonTrump.forEach(c=>(groups[c.s]??=[]).push(c));
  const candidates=[];
  Object.entries(groups).forEach(([s,cards])=>{
    const partnerCount=partnerRemainingCount(partner,s);
    const honorPenalty=cards.filter(c=>['A','K','Q','J'].includes(c.r)).length;
    candidates.push({s,cards,partnerCount,honorPenalty});
  });
  // Prefer a short, non-honor suit that partner is unlikely to need us to hold.
  candidates.sort((a,b)=>a.cards.length-b.cards.length || a.honorPenalty-b.honorPenalty || a.partnerCount-b.partnerCount);
  const chosen=candidates[0].cards.slice().sort((a,b)=>RV2(a.r)-RV2(b.r));
  return chosen[0];
}


/* ══════════════════════════════════════════════════════════════
   DECLARER PLAN 2.0 — contract goal + entries + trump + ruff plans
   Conservative by design. It proposes a plan only when the first move
   is sufficiently supported by the two visible hands. Otherwise the
   existing card engine remains the fallback.
══════════════════════════════════════════════════════════════ */
function visibleDeclCards(){
  const a=playHands[declarer]||[], b=playHands[dummy]||[];
  return a.concat(b);
}
function suitCardsVisible(s){return visibleDeclCards().filter(c=>c.s===s);}
function suitLengthVisible(s){return suitCardsVisible(s).length;}
function handSuitCards(seat,s){return (playHands[seat]||[]).filter(c=>c.s===s).slice().sort((a,b)=>RV2(b.r)-RV2(a.r));}
function contractTrumpCount(){return trump?visibleDeclCards().filter(c=>c.s===trump).length:0;}
function visibleWinnersInSuit(s){
  const cards=suitCardsVisible(s).slice().sort((a,b)=>RV2(b.r)-RV2(a.r));
  if(!cards.length)return 0;
  const vals=new Set(cards.map(c=>c.r)); let n=0;
  if(vals.has('A')) n++;
  if(vals.has('K')&&vals.has('A')) n++;
  if(vals.has('Q')&&vals.has('A')&&vals.has('K')) n++;
  if(vals.has('J')&&vals.has('A')&&vals.has('K')&&vals.has('Q')) n++;
  return n;
}
function suitHasFinesseShape(s){
  const cards=suitCardsVisible(s), vals=new Set(cards.map(c=>c.r));
  if(cards.length<3)return false;
  return (vals.has('A')&&vals.has('J')&&!vals.has('K')) ||
         (vals.has('A')&&vals.has('Q')&&!vals.has('K')&&!vals.has('J')) ||
         (vals.has('K')&&vals.has('Q')&&!vals.has('A'));
}
function declarerPlanState(){
  const req=Math.max(0,contractLevel+6), need=Math.max(0,req-tricksDeclarer);
  const side=[];
  for(const s of SK){
    const cards=suitCardsVisible(s); if(!cards.length)continue;
    side.push({s,len:cards.length,winners:visibleWinnersInSuit(s),finesse:suitHasFinesseShape(s)});
  }
  const dt=trump?handSuitCards(declarer,trump).length:0, nt=trump?handSuitCards(dummy,trump).length:0;
  return {req,need,side,trump,visibleCount:visibleDeclCards().length,declarerTrumps:dt,dummyTrumps:nt};
}

function declarerFindFinesse(seat,legal){
  const other=seat===declarer?dummy:declarer;
  for(const s of SK){
    if(s===trump)continue;
    const from=handSuitCards(seat,s), to=handSuitCards(other,s);
    if(!from.length||!to.length)continue;
    const f=new Set(from.map(c=>c.r)), o=new Set(to.map(c=>c.r));
    // A finesse must be led FROM the hand without the target honor TOWARD
    // the hand holding that honor.  The previous version reversed this
    // relationship and could identify a finesse that was not executable.
    const lowFrom=()=>legal.filter(c=>c.s===s && RV2(c.r)<RV2('Q'))
      .sort((a,b)=>RV2(a.r)-RV2(b.r))[0]||null;
    if(o.has('J') && !f.has('K') && !f.has('Q')){
      const low=lowFrom();
      if(low)return {type:'finesse',s,card:low,targetSeat:other,targetHonor:'J',confidence:0.92};
    }
    if(o.has('Q') && !f.has('K') && !f.has('A')){
      const low=lowFrom();
      if(low)return {type:'finesse',s,card:low,targetSeat:other,targetHonor:'Q',confidence:0.90};
    }
    // K toward Q/J is also a valid finesse candidate when the other hand
    // contains the target honor and the lead can be made from this hand.
    if(f.has('A') && o.has('Q') && !f.has('K')){
      // If A is in the leading hand, a small card from that hand does NOT
      // create the intended finesse; only consider it if the other hand has
      // the lower honor and this hand can preserve A for later.
      const low=legal.filter(c=>c.s===s && c.r!=='A' && RV2(c.r)<RV2('Q'))
        .sort((a,b)=>RV2(a.r)-RV2(b.r))[0];
      if(low)return {type:'finesse',s,card:low,targetSeat:other,targetHonor:'Q',confidence:0.76};
    }
  }
  return null;
}

function declarerFindEntry(seat,legal,targetSeat){
  const other=targetSeat;
  for(const s of SK){
    const from=handSuitCards(seat,s), to=handSuitCards(other,s);
    if(!from.length||!to.length)continue;
    const targetTop=to[0];
    // A practical entry requires a low card in the source hand and a visible
    // established honor in the target hand.  Do not call a suit an entry
    // merely because the target hand owns a Q while the source cannot reach it.
    const established = ['A','K','Q'].includes(targetTop.r);
    if(!established)continue;
    const low=legal.filter(c=>c.s===s && RV2(c.r)<RV2(targetTop.r))
      .sort((a,b)=>RV2(a.r)-RV2(b.r))[0];
    if(low)return {type:'entry',s,card:low,target:targetSeat,targetCard:targetTop,targetHonor:targetTop.r,confidence:0.82};
  }
  return null;
}
function declarerFindSideWinner(seat,legal,plan){
  if(plan.need<=0)return null;
  const candidates=[];
  for(const p of plan.side){
    if(p.s===trump||p.winners<=0)continue;
    const cards=legal.filter(c=>c.s===p.s).sort((a,b)=>RV2(b.r)-RV2(a.r));
    if(!cards.length)continue;
    if(cards[0].r==='A'||(cards[0].r==='K'&&cards.some(c=>c.r==='A')))
      candidates.push({type:'winner',s:p.s,card:cards[0],confidence:0.88});
  }
  return candidates.sort((a,b)=>b.confidence-a.confidence)[0]||null;
}

function declarerFindCrossruff(seat,legal,plan){
  if(!trump||plan.declarerTrumps<2||plan.dummyTrumps<2)return null;
  const other=seat===declarer?dummy:declarer;
  // A crossruff candidate exists when one hand is void in a side suit and the
  // other has that suit plus trumps. Lead that side suit toward the void hand.
  for(const s of SK){
    if(s===trump)continue;
    const mine=handSuitCards(seat,s), theirs=handSuitCards(other,s);
    if(!mine.length&&!theirs.length)continue;
    if(!mine.length && theirs.length){
      // Need to be able to ruff in our hand; leading from the other hand.
      const card=theirs.slice().sort((a,b)=>RV2(a.r)-RV2(b.r))[0];
      if(legal.some(c=>c.s===s))return {type:'crossruff',s,card,confidence:0.74};
    }
    if(mine.length && !theirs.length){
      // Mirror case: the current hand can lead the side suit and the target
      // hand is void, so the target hand can ruff.
      const card=mine.slice().sort((a,b)=>RV2(a.r)-RV2(b.r))[0];
      if(legal.some(c=>c.s===s))return {type:'crossruff',s,card,confidence:0.74};
    }
  }
  return null;
}

function declarerFindDummyReversal(seat,legal,plan){
  if(!trump||plan.dummyTrumps<4||plan.declarerTrumps>2)return null;
  const other=seat===declarer?dummy:declarer;
  const cards=handSuitCards(seat,trump);
  if(!cards.length)return null;
  // Conservative trigger: use a side-suit winner/entry before drawing trump.
  const entry=declarerFindEntry(seat,legal,other);
  if(entry)return {type:'dummyReversal',s:entry.s,card:entry.card,confidence:0.7};
  return null;
}

function declarerFindPromotion(seat,legal){
  for(const s of SK){
    if(s===trump)continue;
    const cards=suitCardsVisible(s).slice().sort((a,b)=>RV2(b.r)-RV2(a.r));
    if(cards.length<4)continue;
    const vals=new Set(cards.map(c=>c.r));
    if(vals.has('A')&&vals.has('K'))continue;
    // A long suit with a missing top honor can be established later; only lead
    // the lowest card when this hand actually has length and no immediate winner.
    const local=legal.filter(c=>c.s===s).sort((a,b)=>RV2(a.r)-RV2(b.r));
    if(local.length>=2)return {type:'promotion',s,card:local[0],confidence:0.62};
  }
  return null;
}


// ── MULTI-STEP DECLARER PLAN (V3.5.4) ─────────────────────────────
// The planner is deliberately conservative: it creates a short sequence of
// executable objectives rather than trying to solve the whole deal at once.
// Each trick is re-evaluated, so the sequence can adapt when a finesse,
// entry, ruff or winner has already been used.
function declarerChainHistory(){
  return (playHistory||[]).map(x=>({seat:x.seat,card:x.card||x})).filter(x=>x.card);
}
function declarerChainSuitPlayed(s, r, sourceSeat){
  return declarerChainHistory().some(x=>x.card.s===s && (!r || x.card.r===r) && (!sourceSeat || x.seat===sourceSeat));
}
function declarerChainPlan(seat,legal){
  if(!(seat===declarer||seat===dummy)||!legal.length)return null;
  const plan=declarerPlanState();
  if(plan.need<=0)return null;

  // Keep the current tactical objective stable across tricks.  A plan is only
  // advanced after its defining card has actually appeared in play history.
  // This prevents the engine from abandoning a finesse/entry chain simply
  // because another attractive candidate becomes visible on the next trick.
  const hist=declarerChainHistory();
  const f=declarerFindFinesse(seat,legal);
  if(f){
    const finessePlayed=hist.some(x=>x.card.s===f.s && x.seat===seat && RV2(x.card.r)<RV2(f.targetHonor));
    if(!finessePlayed && legal.some(c=>c.s===f.card.s&&c.r===f.card.r)){
      return Object.assign({},f,{step:'finesse',sequence:['finesse','entry','sideWinner','trumpControl']});
    }
  }

  // After the finesse lead, look for an executable entry to the target hand.
  // Prefer the suit that actually carried the finesse objective before using
  // an unrelated entry.
  const target=seat===declarer?dummy:declarer;
  const finesseSuit=f && hist.some(x=>x.card.s===f.s && x.card.r===f.card.r) ? f.s : null;
  const entries=[];
  if(finesseSuit){
    const from=handSuitCards(seat,finesseSuit), to=handSuitCards(target,finesseSuit);
    const top=to.slice().sort((a,b)=>RV2(b.r)-RV2(a.r))[0];
    if(top && ['A','K','Q'].includes(top.r)){
      const low=legal.filter(c=>c.s===finesseSuit&&RV2(c.r)<RV2(top.r)).sort((a,b)=>RV2(a.r)-RV2(b.r))[0];
      if(low) entries.push({type:'entry',s:finesseSuit,card:low,target:target,targetCard:top,targetHonor:top.r,confidence:0.95});
    }
  }
  const e=entries[0]||declarerFindEntry(seat,legal,target);
  if(e){
    return Object.assign({},e,{step:'entry',sequence:['entry','sideWinner','trumpControl']});
  }

  const w=declarerFindSideWinner(seat,legal,plan);
  if(w && !declarerChainSuitPlayed(w.s,null,seat)){
    return Object.assign({},w,{step:'sideWinner',sequence:['sideWinner','trumpControl']});
  }

  if(trump){
    const tc=legal.filter(c=>c.s===trump);
    const sideLive=plan.side.some(x=>x.s!==trump && (x.finesse || x.winners>0));
    if(tc.length && !sideLive){
      return {type:'trumpControl',s:trump,card:tc.slice().sort((a,b)=>RV2(b.r)-RV2(a.r))[0],
        confidence:0.78,step:'trumpControl',sequence:['trumpControl']};
    }
  }
  return null;
}
function chooseDeclarerChainCard(seat,legal){
  const c=declarerChainPlan(seat,legal);
  return c && legal.some(x=>x.s===c.card.s && x.r===c.card.r) ? c.card : null;
}

function declarerPlanCandidates(seat,legal){
  const plan=declarerPlanState(), out=[];
  const f=declarerFindFinesse(seat,legal); if(f)out.push(f);
  const rev=declarerFindDummyReversal(seat,legal,plan); if(rev)out.push(rev);
  const cr=declarerFindCrossruff(seat,legal,plan); if(cr)out.push(cr);
  const e=declarerFindEntry(seat,legal,seat===declarer?dummy:declarer); if(e)out.push(e);
  const w=declarerFindSideWinner(seat,legal,plan); if(w)out.push(w);
  const p=declarerFindPromotion(seat,legal); if(p)out.push(p);
  return out.sort((a,b)=>b.confidence-a.confidence);
}

function declarerHighConfidencePlan(seat,legal){
  if(!(seat===declarer||seat===dummy)||!legal.length)return null;
  const plan=declarerPlanState(); if(plan.need<=0)return null;
  const c=declarerPlanCandidates(seat,legal)[0];
  return c && c.confidence>=0.75 ? c : null;
}

function declarerPlanSuitPriority(){
  const need=Math.max(0,(contractLevel+6)-tricksDeclarer), scores=[];
  for(const s of SK){
    const cards=suitCardsVisible(s); if(!cards.length)continue;
    const winners=visibleWinnersInSuit(s), len=cards.length;
    let score=winners*18+Math.min(len,5)*2;
    if(len>=5)score+=8;
    if(suitHasFinesseShape(s))score+=5;
    if(trump&&s===trump)score-=6;
    if(need>=3&&len>=4)score+=4;
    scores.push({s,score,winners,len});
  }
  return scores.sort((a,b)=>b.score-a.score);
}

function chooseDeclarerPlannedLead(seat,legal){
  if(!(seat===declarer||seat===dummy)||!legal.length)return null;
  const chain=chooseDeclarerChainCard(seat,legal);
  if(chain)return chain;
  const high=declarerHighConfidencePlan(seat,legal);
  if(high)return high.card;
  // A medium-confidence plan is used only when there is no safe winner or
  // finesse candidate. This preserves the existing engine's behavior.
  const candidates=declarerPlanCandidates(seat,legal);
  if(candidates.length && candidates[0].confidence>=0.72)return candidates[0].card;
  const priorities=declarerPlanSuitPriority();
  for(const p of priorities){
    if(p.s===trump)continue;
    const cards=legal.filter(c=>c.s===p.s);
    if(cards.length&&p.winners>0)return cards.slice().sort((a,b)=>RV2(b.r)-RV2(a.r))[0];
  }
  if(trump){
    const tc=legal.filter(c=>c.s===trump);
    // Draw only when side-suit plan is exhausted and there are enough trumps
    // to protect against immediate ruffs.
    if(tc.length&&contractTrumpCount()>=6)return tc.slice().sort((a,b)=>RV2(b.r)-RV2(a.r))[0];
  }
  return null;
}

function chooseDeclarerPlannedFollow(seat,follow,curWin,partnerWinning){
  if(!(seat===declarer||seat===dummy)||!follow.length)return null;
  if(partnerWinning)return follow.slice().sort((a,b)=>RV2(a.r)-RV2(b.r))[0];
  const winners=follow.filter(c=>cardBeats(c,curWin.card));
  if(winners.length)return winners.slice().sort((a,b)=>RV2(a.r)-RV2(b.r))[0];
  return follow.slice().sort((a,b)=>RV2(a.r)-RV2(b.r))[0];
}

function chooseCard(seat,h){
  // ── AI DIFFICULTY ─────────────────────────────────────────
  // The normal AI chooses from its own visible-information heuristics.
  // DD is deliberately sampled according to the selected level.
  // This makes stronger play an explicit game setting rather than an
  // invisible "perfect information" behavior.
  const ddRate=getAIDDRate();
  if(ddRate>0 && Math.random()<ddRate){
    const exact=ddGetBestMove(seat);
    if(exact) return exact;
  }

  // ── Sezgisel AI motoru ────────────────────────────────────
  const legal=h.filter(c=>isLegal(seat,c));
  if(!legal.length) return h[0];

  const isDecl=seat===declarer||seat===dummy;
  const isDef=seat===defL||seat===defR;
  const partner=seat===declarer?dummy:seat===dummy?declarer:seat===defL?defR:defL;

  // ── PARTNER'S LED SUIT (for defenders) ────────────────────
  // Track what suit partner opened to follow their lead
  const partnerBids=currentTrick.filter(e=>e.seat===partner);
  const partnerLed=partnerBids.length>0?partnerBids[0].card.s:null;

  // ── LEAD: opening lead vs subsequent lead are different decisions ──
  if(currentTrick.length===0){
    if(isDef){
      if(trickCount>0){
        const sub=chooseSubsequentDefenderLead(seat,legal);
        if(sub) return sub;
      }
      // SLAM SAVUNMASI: 6/7 seviyeye karşı elde As varsa HEMEN çekilmeli.
      // (Beklemek riskli — declarer atarak Ası düşürebilir, tek şansı kaçırırız.)
      if(contractLevel>=6){
        const aces=legal.filter(cv=>cv.r==='A');
        if(aces.length) return aces[0];
      }
      // Defender opening lead:
      // 1. Top of a sequence (AKQ, KQJ, QJT etc.)
      // 2. Lead partner\u2019s suit if known (2nd trick onward)
      // 3. Longest non-trump suit, top of interior sequence
      const nonTrump=trump?legal.filter(cv=>cv.s!==trump):legal;
      const pool=nonTrump.length?nonTrump:legal;
      const slen={};
      pool.forEach(cv=>{slen[cv.s]=(slen[cv.s]||0)+1;});
      // Prefer longest suit
      const bestSuit=Object.keys(slen).sort((a,b)=>slen[b]-slen[a])[0];
      const inSuit=pool.filter(cv=>cv.s===bestSuit).sort((a,b)=>RV2(b.r)-RV2(a.r));
      // Lead top of honors sequence
      if(inSuit.length>=2&&RV2(inSuit[0].r)>=RV2('J')) return inSuit[0];
      // 4th best from longest suit
      if(inSuit.length>=4) return inSuit[inSuit.length-4]||inSuit[inSuit.length-1];
      return inSuit[0];
    } else {
      // Declarer/Dummy: use the plan layer first; generic longest-suit play
      // is only the fallback when no useful plan candidate exists.
      const planned=chooseDeclarerPlannedLead(seat,legal);
      if(planned) return planned;
      const slen={};
      legal.forEach(cv=>{slen[cv.s]=(slen[cv.s]||0)+1;});
      const bestSuit=Object.keys(slen).sort((a,b)=>slen[b]-slen[a])[0];
      return legal.filter(cv=>cv.s===bestSuit).sort((a,b)=>RV2(b.r)-RV2(a.r))[0];
    }
  }

  // ── FOLLOWING TO TRICK ────────────────────────────────────
  const follow=legal.filter(cv=>cv.s===ledSuit);
  const trumpCards=trump?legal.filter(cv=>cv.s===trump):[];

  // Find current winning card
  let curWin=currentTrick[0];
  currentTrick.forEach(({seat:s,card:cv})=>{
    if(cardBeats(cv,curWin.card)) curWin={seat:s,card:cv};
  });

  const partnerWinning=curWin.seat===partner;

  // ── A. Follow suit ────────────────────────────────────────
  if(follow.length){
    if(isDef){
      // DEFENDER RULE 1: If partner is winning → play LOW (don\u2019t waste)
      if(partnerWinning){
        return follow.sort((a,b)=>RV2(a.r)-RV2(b.r))[0];
      }
      // DEFENDER RULE 2: MUST take the trick if possible
      // Play highest winning card first (take the trick!)
      const winning=follow.filter(cv=>cardBeats(cv,curWin.card));
      if(winning.length){
        // Play HIGHEST winner to ensure taking the trick
        return winning.sort((a,b)=>RV2(b.r)-RV2(a.r))[0];
      }
      // Cannot win — play lowest as signal
      return follow.sort((a,b)=>RV2(a.r)-RV2(b.r))[0];
    } else {
      // DECLARER/DUMMY: continue the multi-step declarer plan whenever the
      // planned card is legal in the current trick.
      const chain=chooseDeclarerChainCard(seat,follow);
      if(chain)return chain;
      return chooseDeclarerPlannedFollow(seat,follow,curWin,partnerWinning);
    }
  }

  // ── B. Void in led suit ───────────────────────────────────
  if(trump&&trumpCards.length){
    if(!partnerWinning){
      const trumpPlayed=currentTrick.filter(({card:cv})=>cv.s===trump);
      if(trumpPlayed.length){
        // Overruff only if we can beat the existing trump
        const overruff=trumpCards.filter(cv=>cardBeats(cv,curWin.card));
        if(overruff.length){
          return overruff.sort((a,b)=>RV2(b.r)-RV2(a.r))[0]; // highest overruff to ensure win
        }
        // Can\u2019t overruff → discard lowest non-trump
        const discard=legal.filter(cv=>cv.s!==trump);
        return discard.length?discard.sort((a,b)=>RV2(a.r)-RV2(b.r))[0]:trumpCards.sort((a,b)=>RV2(a.r)-RV2(b.r))[0];
      }
      // Ruff — use lowest trump
      return trumpCards.sort((a,b)=>RV2(a.r)-RV2(b.r))[0];
    }
  }

  // ── C. Discard ────────────────────────────────────────────
  // Defender: discard from suit where partner didn\u2019t lead (keep partner\u2019s suit)
  if(isDef){
    const d=chooseDefensiveDiscard(seat,legal,partner);
    if(d) return d;
  }
  return legal.sort((a,b)=>RV2(a.r)-RV2(b.r))[0];
}

/* ── END PLAY ── */
function endPlay(){
  playActive=false;
  document.getElementById('contractInfo').classList.remove('active');

  const lvl=parseInt(lastBidStr[0]);
  const suitSym=lastBidStr.slice(1);
  const suitKey=suitSym==='NT'?'NT':(SK.find(s=>SUITS[s].sym===suitSym)||'C');
  const req=lvl+6;

  // Declarer'ı history'den yeniden türet (lastBidSeat güvenilmez)
  const lastRealBidH=[...history].reverse().find(h=>h.bid!=='PASS'&&!h.isX&&!h.isXX);
  if(lastRealBidH){
    const lrSeat=lastRealBidH.seat;
    const lrSide=(lrSeat==='N'||lrSeat==='S')?['N','S']:['E','W'];
    let newDecl=lrSeat;
    for(const h of history){
      if(!lrSide.includes(h.seat)||h.bid==='PASS'||h.isX||h.isXX) continue;
      if(h.bid.slice(1)===suitSym){newDecl=h.seat;break;}
    }
    declarer=newDecl;
  }
  const decNS=declarer==='N'||declarer==='S';

  // tricksDeclarer ZATEN oynayan (declaring) tarafın el sayısını tutar
  // (evalTrick içinde NS/EW farkı gözetmeksizin doğru sayılıyor) — bu yüzden
  // burada decNS'e göre TEKRAR seçim yapmak YANLIŞ ve tersine çeviriyordu.
  const decTricks = tricksDeclarer;
  const defTricks = tricksDefenders;
  const diff = decTricks - req;
  const isVul = decNS ? vulNS : vulEW;
  const dblFlag = redoubled?4:doubled?2:1;

  let points=0;
  let breakdown=[];

  if(diff>=0){
    // ── MADE CONTRACT — WBF Duplicate Scoring ──
    // Trick score (contract tricks only)
    // NT: 1st trick=40, rest=30; Major=30/trick; Minor=20/trick
    // All multiplied by dblFlag (1/2/4)
    let basePerTrick = (suitKey==='S'||suitKey==='H') ? 30 :
                       suitKey==='NT' ? 30 : 20;
    let trickScore = lvl * basePerTrick * dblFlag;
    if(suitKey==='NT') trickScore = (40 + (lvl-1)*30) * dblFlag; // NT first trick = 40

    // Game = trick score ≥ 100 (undoubled)
    const rawScore = suitKey==='NT' ? (40+(lvl-1)*30) :
                     (suitKey==='S'||suitKey==='H') ? lvl*30 : lvl*20;
    const isGame = rawScore >= 100;

    // Game/partScore bonus
    let gameBonus = isGame ? (isVul ? 500 : 300) : 50;

    // Slam bonus (on top of game bonus)
    let slamBonus = 0;
    if(lvl===7) slamBonus = isVul ? 1500 : 1000; // Grand Slam
    else if(lvl===6) slamBonus = isVul ? 750 : 500; // Small Slam

    // Overtrick score (above the line)
    let overtrickPts = 0;
    if(diff>0){
      if(redoubled)      overtrickPts = diff * (isVul ? 400 : 200);
      else if(doubled)   overtrickPts = diff * (isVul ? 200 : 100);
      else               overtrickPts = diff * basePerTrick; // NT same as 30
    }

    // Insult bonus for doubled/redoubled contracts
    const insult = redoubled ? 100 : doubled ? 50 : 0;

    points = trickScore + gameBonus + slamBonus + overtrickPts + insult;
    if(decNS) scoreNS+=points; else scoreEW+=points;

    const dblStr = redoubled?' (Surkontrlu)':doubled?' (Kontrlu)':'';
    const vulStr = isVul ? '🔴 Zoneli' : '⚪ Zonesiz';
    breakdown=[
      `Kontrat: <b style="color:var(--gold2)">${lastBidStr}${dblStr}</b> — ${decNS?'<span style="color:#7dd87d">Kuzey-Güney</span>':'<span style="color:#e07070">Doğu-Batı</span>'} ${vulStr}`,
      diff===0
        ? `<b style="color:var(--gold2)">✓ Tam kontrat</b> — ${req} el yapıldı`
        : `<b style="color:#5dbb6e">✓ +${diff} fazla</b> — ${decTricks}/${req} el yapıldı`,
      `Trick puanı: ${trickScore}${dblFlag>1?' (Kontr×'+dblFlag+')':''} | ${isGame?'Oyun bonusu':'Parçalı bonus'}: ${gameBonus}`,
      slamBonus ? `${lvl===7?'Grand Slam':'Küçük Slam'} bonusu: ${slamBonus}` : '',
      overtrickPts ? `Fazla el ×${diff}: ${overtrickPts}` : '',
      insult ? `Kontr insult bonusu: ${insult}` : '',
      `<b style="font-size:15px;color:${decNS?'#7dd87d':'#e07070'}">✦ Toplam: +${points} puan → ${decNS?'NS':'EW'}</b>`,
    ].filter(Boolean);

  } else {
    // ── DOWN — WBF Undertrick Penalties ──
    const down = Math.abs(diff);
    let pen = 0;
    const penLines = [];

    if(redoubled){
      // Redoubled penalties: 2× doubled
      // Doubled non-vul: 100,200,200,300,300... 
      // Doubled vul: 200,300,300,300...
      // Redoubled = ×2
      const dPens = isVul
        ? [200,300,300,300,300,300,300,300,300,300,300,300,300]
        : [100,200,200,300,300,300,300,300,300,300,300,300,300];
      for(let i=0;i<down;i++) pen += (dPens[i]||300) * 2;
      penLines.push(`Surkontrlu ceza (${isVul?'Zoneli':'Zonesiz'}): ${pen}`);
    } else if(doubled){
      // Doubled non-vul: 100,200,200,300,300...
      // Doubled vul: 200,300,300,300...
      const dPens = isVul
        ? [200,300,300,300,300,300,300,300,300,300,300,300,300]
        : [100,200,200,300,300,300,300,300,300,300,300,300,300];
      for(let i=0;i<down;i++) pen += dPens[i]||300;
      penLines.push(`Kontrlu ceza (${isVul?'Zoneli':'Zonesiz'}): ${pen}`);
    } else {
      // Undoubled: non-vul=50/trick, vul=100/trick
      pen = down * (isVul ? 100 : 50);
      penLines.push(`${isVul?'Zoneli':'Zonesiz'} ceza (${down}×${isVul?100:50}): ${pen}`);
    }

    points = pen;
    if(decNS) scoreEW+=points; else scoreNS+=points;

    const dblStr = redoubled?' (Surkontrlu)':doubled?' (Kontrlu)':'';
    const winner = decNS?'EW':'NS';
    breakdown=[
      `Kontrat: <b style="color:var(--gold2)">${lastBidStr}${dblStr}</b> — ${decNS?'<span style="color:#7dd87d">Kuzey-Güney</span>':'<span style="color:#e07070">Doğu-Batı</span>'}`,
      `<b style="color:#e05252">✗ ${down} içeri!</b> — ${decNS?'NS':'EW'} ${decTricks} el aldı, ${req} el gerekirdi`,
      ...penLines,
      `<b style="font-size:15px;color:${winner==='NS'?'#7dd87d':'#e07070'}">✦ Toplam: +${points} puan → ${winner}</b>`,
    ];
  }

  // Advance dealer for next deal
  dealerIdx++;
  updateInfoBar();

  el('scoreContent').innerHTML=`
    <div style="line-height:1.9;font-size:13px">${breakdown.join('<br>')}</div>
    <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);display:flex;gap:20px;justify-content:center;font-family:'Playfair Display',serif;">
      <span style="color:#7dd87d;font-size:15px;font-weight:700">NS: ${scoreNS>=0?'+':''}${scoreNS}</span>
      <span style="color:var(--muted)">|</span>
      <span style="color:#e07070;font-size:15px;font-weight:700">EW: ${scoreEW>=0?'+':''}${scoreEW}</span>
    </div>`;
  el('scoreBar').classList.add('active');
}

/* ── CONTRACT INFO PANEL ── */
function updateContractInfo(){
  const info=document.getElementById('contractInfo');
  if(!info) return;
  if(!lastBidStr||!playActive){info.classList.remove('active');return;}
  info.classList.add('active');

  // Contract display with colored suit
  const lvl=lastBidStr[0];
  const suitSym=lastBidStr.slice(1);
  let suitCol='var(--cream)';
  if(suitSym==='♥'||suitSym==='♦') suitCol='#e05252';
  const dblMark=doubled?' <span style="color:var(--gold2)">X</span>':redoubled?' <span style="color:#e05252">XX</span>':'';
  document.getElementById('ci-contract').innerHTML=
    `${lvl}<span style="color:${suitCol}">${suitSym}</span>${dblMark}`;

  // Which side is declarer
  const decNS=declarer==='N'||declarer==='S';
  const ciVul=decNS?vulNS:vulEW;
  document.getElementById('ci-side').textContent=
    (decNS?'Kuzey-Güney':'Doğu-Batı')+' oynuyor'+(ciVul?' 🔴 ZONELİ':'');

  const req=parseInt(lastBidStr[0])+6;
  // tricksDeclarer ZATEN oynayan tarafın el sayısıdır (NS/EW farkı gözetmeden)
  const decTricks=tricksDeclarer;
  const remaining=13-trickCount;
  const needed=req-decTricks;
  const pct=Math.min(100,Math.round((decTricks/req)*100));

  const needEl=document.getElementById('ci-need');
  const haveEl=document.getElementById('ci-have');
  const leftEl=document.getElementById('ci-left');

  needEl.textContent=req;
  haveEl.textContent=decTricks;
  haveEl.className='ci-val'+(decTricks>=req?' good':needed>remaining?' bad':'');

  // Remaining tricks needed
  if(needed<=0){
    leftEl.textContent='Kontrat tamam!';leftEl.className='ci-val good';
  } else if(needed>remaining){
    leftEl.textContent=`${needed} gerekli, ${remaining} kaldı`;leftEl.className='ci-val bad';
  } else {
    leftEl.textContent=`${needed} el daha`;leftEl.className='ci-val';
  }

  document.getElementById('ci-bar').style.width=pct+'%';
}

/* ════════════════════════════════════════════════════
   BID EXPLANATION ENGINE
════════════════════════════════════════════════════ */
function showBidExplain(entry){
  const panel=el('bidExplain');
  if(!panel) return;
  panel.style.display='block';

  const seat=entry.seat;
  const bid=entry.bid;
  const isNS=seat==='N'||seat==='S';
  const seatInitial={'N':'K','E':'D','S':'G','W':'B'}[seat]||seat;
  const sideClass=isNS?'ns':'ew';

  let bidTag='', explanation='';

  // ── Jacoby Transfer açıklamaları ──────────────────────────
  const lastRealBid=[...history].slice(0,-1).reverse()
    .find(x=>x.bid!=='PASS'&&!x.isX&&!x.isXX);

  if(!entry.isX&&!entry.isXX&&lastRealBid&&lastRealBid.bid==='1NT'){
    if(bid===bstr(2,'D')){
      bidTag='2♦'; explanation='Jacoby Transfer → partner 2♥ der. 5+ Kupa, herhangi bir güç.';
    } else if(bid===bstr(2,'H')){
      bidTag='2♥'; explanation='Jacoby Transfer → partner 2♠ der. 5+ Maça, herhangi bir güç.';
    } else if(bid===bstr(2,'C')){
      bidTag='2♣'; explanation='Stayman — 4+ kartlı majör aranıyor. Partner 2♦/2♥/2♠ der.';
    } else if(bid==='2NT'){
      bidTag='2NT'; explanation='1NT\u2019e davet. Dengeli el, 8-9 onör puan.';
    } else if(bid==='4NT'){
      bidTag='4NT'; explanation='Quantitative — slam daveti. Dengeli el, 15-16 onör puan.';
    }
    if(bidTag){
      _appendExplain(panel,seatInitial,sideClass,bidTag,explanation);
      return;
    }
  }

  // ── 4NT / RKCB ────────────────────────────────────────────
  if(bid==='4NT'){
    if(lastBlackwood()===entry){
      bidTag='4NT';
      explanation='RKCB 1430 — 4 As + koz Papazı (5 Key Card) sorgusu.';
    }else{
      bidTag='4NT';
      explanation='Quantitative 4NT — dengeli el ile şlem daveti; Key Card sorgusu değil.';
    }
    _appendExplain(panel,seatInitial,sideClass,bidTag,explanation);
    return;
  }
  const bw=lastBlackwood();
  if(!entry.isX&&!entry.isXX&&parseInt(bid[0])===5&&bw&&history.indexOf(entry)>history.indexOf(bw)){
    const map={'C':'1 veya 4','D':'0 veya 3','H':'2, koz Q yok','S':'2, koz Q var'};
    bidTag=bid;
    explanation='RKCB 1430 cevabı — '+(map[suitOf(bid)]||'Key Card cevabı')+'.';
    _appendExplain(panel,seatInitial,sideClass,bidTag,explanation);
    return;
  }
  if(bid==='5NT' && lastFiveNT()===entry){
    bidTag='5NT';
    explanation='5NT — RKCB sonrası yan renk Papazları sorgulanıyor; koz Papazı zaten Key Card.';
    _appendExplain(panel,seatInitial,sideClass,bidTag,explanation);
    return;
  }
  const fn=lastFiveNT&&lastFiveNT();
  if(!entry.isX&&!entry.isXX&&parseInt(bid[0])===6&&fn){
    const kingsShown={'♣':'0','♦':'1','♥':'2','♠':'3','NT':'4'}[bid.slice(1)]||'?';
    bidTag=bid;
    explanation='5NT cevabı — yan renk Papazları.';
    _appendExplain(panel,seatInitial,sideClass,bidTag,explanation);
    return;
  }

  // ── X / XX ────────────────────────────────────────────────
  if(entry.isX){
    bidTag='X';
    // Negatif double mı, penalty mi, takeout mı?
    const lastR=[...history].reverse().find(x=>x.bid!=='PASS'&&!x.isX&&!x.isXX&&x!==entry);
    const oppOfSeat=(isNS?['E','W']:['N','S']);
    if(lastR&&oppOfSeat.includes(lastR.seat)){
      const oppSuit=suitOf(lastR.bid);
      if(oppSuit==='S') explanation='Negatif Double — 4+ Kupa, 8+ onör puan.';
      else if(oppSuit==='H') explanation='Negatif Double — 4+ Maça, 8+ onör puan.';
      else if(oppSuit==='D'||oppSuit==='C') explanation='Negatif Double — 4+ kartlı majör(ler), 8+ onör puan.';
      else explanation='Takeout Double — diğer renklerde güç, 12+ onör puan.';
    } else {
      explanation='Kontr — rakibin kontratını tehdit ediyor. 13+ onör puan veya güçlü defans eli.';
    }
    _appendExplain(panel,seatInitial,sideClass,bidTag,explanation);
    return;
  }
  if(entry.isXX){
    bidTag='XX';
    explanation='Surkontr — kontratın yapılacağına güven. Puan dört katına çıkar.';
    _appendExplain(panel,seatInitial,sideClass,bidTag,explanation);
    return;
  }
  if(bid==='PASS'){
    bidTag='PAS';
    // Pas açıklaması: kaçıncı pas, hangi aşamada
    const realBids=history.filter(x=>x.bid!=='PASS'&&!x.isX&&!x.isXX);
    if(realBids.length===0) explanation='Açılış gücü yok. 11 ve altı onör puan.';
    else explanation='Bu aşamada devam etmek için yeterli güç yok.';
    _appendExplain(panel,seatInitial,sideClass,bidTag,explanation);
    return;
  }

  // ── Gerçek bid — aralık bazlı açıklama ───────────────────
  const lvl=parseInt(bid[0]);
  const suitSym=bid.slice(1);
  const suitKey=suitSym==='NT'?'NT':(SK.find(s=>SUITS[s].sym===suitSym)||'C');
  const suitName={'S':'Maça','H':'Kupa','D':'Karo','C':'Sinek','NT':'Koz Yok'}[suitKey]||suitSym;
  bidTag=bid;

  const myBids=history.filter(x=>x.seat===seat&&x.bid!=='PASS'&&!x.isX&&!x.isXX);
  const pBids=history.filter(x=>{
    const p=seat==='N'?'S':seat==='S'?'N':seat==='E'?'W':'E';
    return x.seat===p&&x.bid!=='PASS'&&!x.isX&&!x.isXX;
  });
  const isFirstBid=myBids.length<=1;
  const pLast=pBids[pBids.length-1];

  // ── Açılış bidleri ────────────────────────────────────────
  if(isFirstBid && !pLast){
    if(suitSym==='NT'&&lvl===1)
      explanation='Dengeli el. 15-17 onör puan, 5\u2019li majör yok.';
    else if(suitSym==='NT'&&lvl===2)
      explanation='Dengeli el. 20-21 onör puan.';
    else if(suitSym==='NT'&&lvl===3)
      explanation='Dengeli el. 25-27 onör puan.';
    else if(suitKey==='C'&&lvl===2)
      explanation='Güçlü açılış. 22+ onör puan veya 8+ oyun eli. Forcing.';
    else if((suitKey==='S'||suitKey==='H')&&lvl===1)
      explanation='5+ '+suitName+'. 12-21 onör puan. Beşli Majör açılışı.';
    else if((suitKey==='D'||suitKey==='C')&&lvl===1)
      explanation=suitName+' açılışı. 12-21 onör puan, 4+ kart (5\u2019li majör yok).';
    else if(lvl===2)
      explanation='Preempt — 6+ '+suitName+'. 6-10 onör puan. Rakibi zorluyor.';
    else if(lvl===3)
      explanation='Preempt — 7+ '+suitName+'. 5-10 onör puan. Rakibi zorluyor.';
    else
      explanation=lvl+'. seviye '+suitName+' açılışı.';

  // ── Cevap bidleri ─────────────────────────────────────────
  } else if(isFirstBid && pLast){
    const pSym=pLast.bid.slice(1);
    const pSuitKey=pSym==='NT'?'NT':(SK.find(s=>SUITS[s].sym===pSym)||'C');
    const pName={'S':'Maça','H':'Kupa','D':'Karo','C':'Sinek','NT':'NT'}[pSuitKey]||pSym;

    if(suitKey==='NT'&&lvl===1)
      explanation=pLast.bid+'\u2019e yanıt. Dengeli el, 6-9 onör puan, '+pName+' desteği yok.';
    else if(suitKey==='NT'&&lvl===2)
      explanation=pLast.bid+'\u2019e davet. Dengeli el, 11-12 onör puan.';
    else if(suitKey==='NT'&&lvl===3)
      explanation=pLast.bid+'\u2019e direkt oyun. 13-15 onör puan, fit yok.';
    else if(suitKey===pSuitKey&&lvl===2)
      explanation=pName+' desteği (raise). 3+ kart, 6-9 onör puan.';
    else if(suitKey===pSuitKey&&lvl===3)
      explanation=pName+' limit raise. 3+ kart, 10-12 onör puan.';
    else if(suitKey===pSuitKey&&lvl===4)
      explanation=pName+' direkt oyun. 4+ kart, 13+ onör puan.';
    else if(lvl===1)
      explanation='Yeni renk — 4+ '+suitName+'. 6+ onör puan. Forcing.';
    else if(lvl===2)
      explanation='2/1 cevap — 4+ '+suitName+'. 10+ onör puan. Game-forcing.';
    else if(lvl===4&&(suitKey==='S'||suitKey==='H'))
      explanation='Splinter veya direkt oyun — '+suitName+'. 5+ kart, 12+ onör puan.';
    else
      explanation=pLast.bid+'\u2019e cevap — '+suitName+'.';

  // ── Rebid / devam bidleri ─────────────────────────────────
  } else {
    if(suitKey==='NT'&&lvl===1)
      explanation='Dengeli el rebidi. 12-14 onör puan, fit yok.';
    else if(suitKey==='NT'&&lvl===2)
      explanation='Güçlü NT rebid. 18-19 onör puan.';
    else if(suitKey==='NT'&&lvl===3)
      explanation='Oyun bölgesi. 20+ onör puan, dengeli.';
    else if(lvl===4&&(suitKey==='S'||suitKey==='H'))
      explanation=suitName+' oyunu. 8+ kart fiti, oyun bölgesi.';
    else if(lvl>=6)
      explanation=(lvl===7?'Grand Slam':'Küçük Slam')+' — '+suitName+'. Güçlü el.';
    else if(lvl===4&&suitKey==='NT')
      explanation='Blackwood — As sorgusu.';
    else
      explanation=(lvl<=2?'Minimum':'Güçlü')+' rebid — '+suitName+'.';
  }

  _appendExplain(panel,seatInitial,sideClass,bidTag,explanation);
}

function _appendExplain(panel,init,cls,tag,exp){
  const div=document.createElement('div');
  div.className='be-entry';
  div.innerHTML=
    '<span class="be-seat '+cls+'">'+init+':</span>'+
    '<span class="be-bid-tag">'+tag+'</span>'+
    '<span class="be-text">= '+exp+'</span>';
  panel.appendChild(div);
  panel.scrollTop=panel.scrollHeight;
}

function seatNameShort(s){return{N:'Kuzey',E:'Doğu',S:'Güney',W:'Batı'}[s]||s;}

/* ════════════════════════════════════════════════════
   START
════════════════════════════════════════════════════ */

window.addEventListener('DOMContentLoaded', bootApp);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW kayıt hatası:', err));
  });
}

/* ══════════════════════════════════════════════════════════════
   EKRANA SIĞDIRMA — telefon/tablet uygulaması için
   Oyun sabit genişlikte tasarlandığından, #appRoot'u ekran
   boyutuna göre otomatik ölçeklendirir (dikey/yatay her ikisinde).
════════════════════════════════════════════════════ */
function fitToScreen(){
  const root = document.getElementById('appRoot');
  if(!root) return;
  // transform, layout ölçümünü etkilemez — sıfırlamaya gerek yok (titreme olmasın)
  const naturalW = root.scrollWidth;
  const naturalH = root.scrollHeight;
  if(naturalW===0 || naturalH===0) return;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scale = Math.min(vw / naturalW, vh / naturalH);

  root.style.width = naturalW + 'px';
  root.style.transform = 'scale(' + scale + ')';

  // Ölçeklenmiş içeriği ekranda ortala
  const scaledW = naturalW * scale;
  const scaledH = naturalH * scale;
  root.style.left = Math.max(0, (vw - scaledW) / 2) + 'px';
  root.style.top = Math.max(0, (vh - scaledH) / 2) + 'px';
}

window.addEventListener('load', () => setTimeout(fitToScreen, 50));
window.addEventListener('resize', fitToScreen);
window.addEventListener('orientationchange', () => setTimeout(fitToScreen, 200));
// Oyun akışı DOM'u sık sık günceller (yeni el, oyun fazı vb.) — periyodik olarak da kontrol et
setInterval(fitToScreen, 1000);
