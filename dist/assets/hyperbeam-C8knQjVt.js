import"./modulepreload-polyfill-B5Qt9EMX.js";import{m as d}from"./mainnet-node-list-Da3NravT.js";import"./nav-BgMtwFJp.js";const L="https://hyperbeam-uptime.xyz/?url=",M="https://hyperbeam-uptime.xyz/status";function v(t){try{const a=new URL(t);return a.pathname=a.pathname.replace(/\/+$/,""),a.toString()}catch{return(t||"").replace(/\/+$/,"")}}async function I(){const t=await fetch(`${M}?t=${Date.now()}`,{cache:"no-store"});if(!t.ok)throw new Error(`Status fetch failed: ${t.status}`);const{statuses:a=[]}=await t.json(),n=new Map;for(const e of a)n.set(v(e.url),e);return n}function B(t,a,n){const e=t.querySelector(".status-indicator"),s=t.querySelector(".status span:last-child"),i=t.querySelector(".response-time");if(!a)return e.className="status-indicator unavailable",s.textContent="Unavailable",i.textContent="Unknown",!1;if(!!!a.online)return e.className="status-indicator unavailable",s.textContent="Unavailable",i.textContent="Offline",!1;const l=Number(a.responseTime??0),r=l>n;return e.className=`status-indicator ${r?"busy":"online"}`,s.textContent=r?"Busy":"Online",i.textContent=`Response time: ${l||"—"}ms`,!0}function k(t,a){const n=t.querySelector(".cu-status-container .status-indicator"),e=t.querySelector(".cu-status-container .status span:last-child"),s=t.querySelector(".cu-status-container .response-time");if(!a)return n.className="status-indicator unavailable",e.textContent="CU Unavailable",s.textContent="Unknown",!1;if(!!!a.online)return n.className="status-indicator unavailable",e.textContent="CU Unavailable",s.textContent="Offline",!1;const o=Number(a.responseTime??0);return n.className="status-indicator online",e.textContent="Online",s.textContent=`Response time: ${o||"—"}ms`,!0}const U={busyTimeout:2e3,autoRefreshInterval:3e5};let g,w=0,C=0,y=0,x=0;function O(){S(),A()}function A(){g&&clearInterval(g),g=setInterval(()=>S(),U.autoRefreshInterval)}function z(){const t=document.getElementById("mainnetLastUpdated"),n=`Last updated: ${new Date().toLocaleTimeString()}`;t&&(t.textContent=n)}async function S(){const t=document.getElementById("mainnetStatusContainer");console.log("Starting mainnet node check..."),t.innerHTML="",z(),w=d.length,C=0,y=d.filter(s=>s.cu&&s.cu!=="--").length,x=0;let a=0;const n=d.length;let e;try{e=await I()}catch(s){console.error("Failed to load aggregated status:",s),d.forEach(i=>{b(null,null,i.hb,i.cu,t,()=>{})}),N();return}console.log(`Checking ${d.length} mainnet nodes with ${y} CU nodes...`),d.forEach(s=>{const i=v(s.hb),o=s.cu&&s.cu!=="--"?v(s.cu):"--",l=e.get(i),r=o==="--"?null:e.get(o);b(null,null,s.hb,s.cu,t,(c,p)=>{c&&C++,s.cu!=="--"&&p&&x++,a++,a===n&&setTimeout(()=>H(t),100),N()},l,r)})}function b(t,a,n,e,s,i,o,l){const r=`mainnet-${n.replace(/https?:\/\//,"").replace(/\./g,"-").replace(/\//g,"")}`,c=n.replace(/^https?:\/\//,"").replace(/\/$/,""),p=e&&e!=="--"?e.replace(/^https?:\/\//,"").replace(/\/$/,""):"--",u=document.createElement("div");u.id=r,u.className="node-card",s.appendChild(u),u.innerHTML=`
    <div class="node-name">${c}</div>
    <div class="status">
      <span class="status-indicator loading"></span>
      <span>Loading...</span>
    </div>
    <div class="response-time">-</div>
    <div class="cu-status-container">
      <div class="cu-label">CU: ${p}</div>
      <div class="status">
        <span class="status-indicator ${e==="--"?"unavailable":"loading"}"></span>
        <span>${e==="--"?"Not Available":"Loading..."}</span>
      </div>
      <div class="response-time">-</div>
    </div>
    <div class="node-actions">
      <a href="${h(n)}" target="_blank" title="Visit HyperBEAM Node">
        <i class="fas fa-external-link-alt"></i>
      </a>
      <a href="${h(n)}~meta@1.0/info" target="_blank" title="View HyperBEAM Metadata">
        <i class="fas fa-info-circle"></i>
      </a>
      ${e!=="--"?`
      <a href="${h(e)}" target="_blank" title="Visit CU Node">
        <i class="fas fa-server"></i>
      </a>`:""}
    </div>
  `;const E=B(u,o,U.busyTimeout);let T=!1;e!=="--"&&(T=k(u,l)),i&&i(E,T)}function h(t){return t.includes(L)?decodeURIComponent(t.split("url=")[1]):t}function H(t){const a=Array.from(t.children);a.sort((n,e)=>{const s=r=>{const c=r.querySelector(".status-indicator");return c.classList.contains("online")?1:c.classList.contains("busy")?2:c.classList.contains("unavailable")?3:4},i=r=>{const c=r.querySelector(".node-name").textContent;return/\d+\.\d+\.\d+\.\d+|:\d+/.test(c)?2:1},o=s(n),l=s(e);return o!==l?o-l:i(n)-i(e)}),a.forEach(n=>t.appendChild(n))}function q(){return w}function R(){return C}function P(){return y}function F(){return x}let f=!1;document.addEventListener("DOMContentLoaded",function(){console.log("DOM Content Loaded event fired"),_(),setTimeout(()=>{console.log("Delayed initialization starting..."),$()},200),setTimeout(()=>{f||(console.log("Fallback initialization due to timeout"),$())},1e3)});window.addEventListener("load",function(){if(console.log("Window load event fired"),!f)console.log("Initializing app from load event"),$();else{console.log("App was already initialized, refreshing data");const t=document.getElementById("mainnetNodesContent"),a=document.getElementById("mainnetStatusContainer");t&&a&&a.children.length===0&&(console.log("Nodes container exists but is empty, rechecking nodes..."),S())}});function _(){const t=window.location.pathname;document.querySelectorAll(".nav-item").forEach(n=>{const e=n.getAttribute("href");(t.includes(e)&&e!=="/"&&e!=="/index.html"||e==="/index.html"&&(t==="/"||t==="/index.html"))&&n.classList.add("active")})}let m;function $(){if(f){console.log("App already initialized, skipping");return}console.log("Initializing app..."),m=document.getElementById("summaryText");const t=document.getElementById("mainnetNodesContent"),a=document.getElementById("mainnetStatusContainer");if(t){if(!a){console.warn("Mainnet status container is missing! Creating it...");const n=document.createElement("div");n.id="mainnetStatusContainer",n.className="node-grid",t.appendChild(n)}console.log("Initializing mainnet nodes..."),O()}else console.warn("Mainnet nodes section not found. Skipping mainnet initialization.");f=!0,console.log("App initialization complete")}function N(){if(!m&&(m=document.getElementById("summaryText"),!m)){console.warn("Summary text element not found. Cannot update summary.");return}const t=q()||0,a=R()||0,n=P()||0,e=F()||0,s=Math.min(e,n),i=Math.min(a,t),o=Math.max(n,e),l=Math.max(t,a),r=l>0?(i/l*100).toFixed(1):0,c=o>0?(s/o*100).toFixed(1):0;m.innerHTML=`
        <div class="stats-section">
            <h3>HyperBEAM Nodes</h3>
            <strong>${i}</strong> of <strong>${l}</strong> nodes available (${r}%)
            <br>
            <progress value="${i}" max="${l}" style="width: 70%; margin-top: 10px;"></progress>
        </div>
        
        <div class="stats-section" style="margin-top: 15px;">
            <h3>Compute Units (CU)</h3>
            <strong>${s}</strong> of <strong>${o}</strong> nodes available (${c}%)
            <br>
            <progress value="${s}" max="${o}" style="width: 70%; margin-top: 10px;"></progress>
        </div>
    `}
