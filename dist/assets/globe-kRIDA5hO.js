import"./modulepreload-polyfill-B5Qt9EMX.js";import{m as f}from"./mainnet-node-list-Da3NravT.js";class y{constructor(){this.proxyURL="https://hyperbeam-uptime.xyz/?url=",this.statusEndpoint="https://hyperbeam-uptime.xyz/status",this.globe=null,this.nodeData=[],this.showLabels=!0,this.showClouds=!1,this.autoRotate=!0,this.refreshTimer=null,this.busyMs=2e3,this.init()}async init(){try{await this.loadNodeData(),this.createGlobe(),this.hideLoading()}catch(t){console.error("Error initializing globe:",t),this.hideLoading()}}normalizeUrl(t){try{const s=new URL(t);return s.pathname=s.pathname.replace(/\/+$/,""),s.toString()}catch{return(t||"").replace(/\/+$/,"")}}async fetchAggregatedStatus(){const t=await fetch(`${this.statusEndpoint}?t=${Date.now()}`,{cache:"no-store"});if(!t.ok)throw new Error(`Status fetch failed: ${t.status}`);const{statuses:s=[]}=await t.json(),o=new Map;for(const e of s)o.set(this.normalizeUrl(e.url),e);return o}statusFromSnapshot(t){return!t||!t.online?"offline":Number(t.responseTime??0)>this.busyMs?"busy":"online"}extractHostname(t){try{return new URL(t.startsWith("http")?t:`http://${t}`).hostname}catch{const o=t.match(/^(?:https?:\/\/)?([^\/:\s]+)/);return o?o[1]:t}}async loadNodeData(){try{const t=f;let s;try{s=await this.fetchAggregatedStatus()}catch(e){console.error("Failed to load aggregated status for globe:",e),s=new Map}const o=t.map(e=>{const i=this.normalizeUrl(e.hb),r=s.get(i),a=this.statusFromSnapshot(r);return{url:this.extractHostname(e.hb),lat:e.lat,lng:e.lng,status:a,location:e.location||"Unknown Location",country:e.country||"Unknown",fullUrl:e.hb,cu:e.cu||"--",proxy:e.proxy||!1}});this.nodeData=this.clusterNodesByLocation(o),this.updateStats()}catch(t){console.error("Error loading node data:",t),this.nodeData=[{url:"Sample Node",lat:0,lng:0,status:"offline",location:"Error loading nodes",fullUrl:"#",cu:"--",proxy:!1}],this.updateStats()}}clusterNodesByLocation(t){const s=new Map;t.forEach(e=>{const i=`${e.lat.toFixed(2)}_${e.lng.toFixed(2)}`;s.has(i)||s.set(i,{lat:e.lat,lng:e.lng,location:e.location,nodes:[],statuses:{online:0,busy:0,offline:0}});const r=s.get(i);r.nodes.push(e),r.statuses[e.status]++});const o=[];return s.forEach(e=>{const i=e.nodes.length;if(i>=2){const{online:r,busy:a,offline:u}=e.statuses;let c="offline";r>0&&(c="online"),a>u&&a>r&&(c="busy"),o.push({...e.nodes[0],status:c,isCluster:!0,clusterSize:i,clusterStats:e.statuses,allNodes:e.nodes,url:`${i} nodes in ${e.location}`})}else e.nodes.forEach(r=>{o.push({...r,lat:r.lat+(Math.random()-.5)*.05,lng:r.lng+(Math.random()-.5)*.05,isCluster:!1})})}),o}createGlobe(){try{this.globe=Globe(document.getElementById("globe-container"),{rendererConfig:{antialias:!1,alpha:!1,powerPreference:"default",preserveDrawingBuffer:!1}}).globeImageUrl("//unpkg.com/three-globe/example/img/earth-blue-marble.jpg").bumpImageUrl(null).backgroundImageUrl("//unpkg.com/three-globe/example/img/night-sky.png").pointsData(this.nodeData).pointColor(t=>{const o=this.getStatusColor(t.status).replace("#",""),e=parseInt(o.substr(0,2),16),i=parseInt(o.substr(2,2),16),r=parseInt(o.substr(4,2),16);return`rgba(${e}, ${i}, ${r}, 0.7)`}).pointAltitude(t=>t.isCluster?.02:.05).pointRadius(t=>t.isCluster?.2+t.clusterSize*.015:.1).pointResolution(10).pointLabel("").onPointClick(null).onPointHover((t,s)=>{this.hoverTimeout&&(clearTimeout(this.hoverTimeout),this.hoverTimeout=null),t&&!s?(this.wasAutoRotating=this.autoRotate,this.wasAutoRotating&&this.globe&&this.globe.controls()&&(this.globe.controls().autoRotate=!1),this.showCustomTooltip(t)):!t&&s&&(this.hoverTimeout=setTimeout(()=>{const o=document.getElementById("custom-globe-tooltip");(!o||!o.matches(":hover"))&&(this.hideCustomTooltip(),this.wasAutoRotating&&this.globe&&this.globe.controls()&&(this.globe.controls().autoRotate=!0))},100))}).ringsData(this.nodeData).ringColor(t=>this.getStatusColor(t.status)).ringMaxRadius(t=>(t.isCluster?.2+t.clusterSize*.015:.1)*1.2).ringRepeatPeriod(0).ringPropagationSpeed(0).width(window.innerWidth).height(window.innerHeight).enablePointerInteraction(!0),this.globe(document.getElementById("globe-container")),setTimeout(()=>{try{this.globe.pointOfView({lat:20,lng:-100,altitude:2});const t=this.globe.controls();t&&this.autoRotate&&(t.autoRotate=!0,t.autoRotateSpeed=.6,console.log("Auto-rotation started"))}catch(t){console.warn("Could not start auto-rotation:",t)}},100),this.showClouds&&this.addCloudLayer(),window.addEventListener("resize",()=>{try{this.globe.width(window.innerWidth).height(window.innerHeight)}catch(t){console.warn("Error during resize:",t)}}),console.log("Globe created successfully")}catch(t){console.error("Error creating globe:",t),document.getElementById("loading").innerHTML=`
        <div style="color: #ef4444;">
          <div style="font-size: 2rem; margin-bottom: 10px;">⚠️</div>
          <div>Failed to load globe visualization</div>
          <div style="font-size: 0.9rem; margin-top: 10px;">Please check your internet connection and try refreshing</div>
        </div>
      `,this.hideLoading()}}getStatusColor(t){switch(t){case"online":return"#10b981";case"busy":return"#f59e0b";case"offline":return"#ef4444";default:return"#6b7280"}}createTooltip(t){const s=this.getStatusColor(t.status);if(t.isCluster){const{online:o,busy:e,offline:i}=t.clusterStats;let r=t.allNodes.map(a=>`
          <div style="margin: 2px 0; display: flex; align-items: center;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${this.getStatusColor(a.status)}; margin-right: 6px;"></span>
            <span style="font-size: 12px;">${a.url}</span>
            <span style="font-size: 11px; opacity: 0.7; margin-left: 4px;">(${a.status})</span>
          </div>
        `).join("");return`
        <div class="globe-tooltip">
          <div style="font-weight: bold; margin-bottom: 8px;">
            <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${s}; margin-right: 8px;"></span>
            ${t.clusterSize} nodes in ${t.location}
          </div>
          <div style="margin-bottom: 8px;">
            <strong>Status Summary:</strong> ${o} online, ${e} busy, ${i} offline
          </div>
          <div style="max-height: 150px; overflow-y: auto; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 8px;">
            ${r}
          </div>
        </div>
      `}else return`
        <div class="globe-tooltip">
          <div style="font-weight: bold; margin-bottom: 8px;">
            <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${s}; margin-right: 8px;"></span>
            ${t.url}
          </div>
          <div style="margin-bottom: 4px;"><strong>Location:</strong> ${t.location}</div>
          <div style="margin-bottom: 4px;"><strong>Status:</strong> ${t.status.charAt(0).toUpperCase()+t.status.slice(1)}</div>
          ${t.cu!=="--"?"<div><strong>CU:</strong> Available</div>":"<div><strong>CU:</strong> Not Available</div>"}
        </div>
      `}showCustomTooltip(t){this.hideCustomTooltip();const s=this.globe.getScreenCoords(t.lat,t.lng,t.isCluster?.02:.05);if(!s)return;const o=document.createElement("div");o.id="custom-globe-tooltip",o.className="custom-globe-tooltip";const e=this.getStatusColor(t.status);let i;if(t.isCluster){const{online:u,busy:c,offline:h}=t.clusterStats;let p=t.allNodes.map(g=>{const m=this.getStatusColor(g.status),b=g.fullUrl,d=g.cu!=="--"?g.cu:null;return`
          <div style="margin: 4px 0;">
            <div style="display: flex; align-items: center;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${m}; margin-right: 6px;"></span>
              <a href="${b}" target="_blank" style="color: #60a5fa; text-decoration: none; font-size: 12px;">${g.url}</a>
              <span style="font-size: 11px; opacity: 0.7; margin-left: 4px;">(${g.status})</span>
            </div>
            ${d?`<div style="margin-left: 20px; margin-top: 2px;">
              <a href="${d}" target="_blank" style="color: #a78bfa; text-decoration: none; font-size: 11px;">CU: ${d.replace(/^https?:\/\//,"").replace(/\/$/,"")}</a>
            </div>`:""}
          </div>
        `}).join("");i=`
        <div style="font-weight: bold; margin-bottom: 8px;">
          <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${e}; margin-right: 8px;"></span>
          ${t.clusterSize} nodes in ${t.location}
        </div>
        <div style="margin-bottom: 8px;">
          <strong>Status Summary:</strong> ${u} online, ${c} busy, ${h} offline
        </div>
        <div style="max-height: 150px; overflow-y: auto; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 8px;">
          ${p}
        </div>
      `}else{const u=t.fullUrl,c=t.cu!=="--"?t.cu:null;i=`
        <div style="font-weight: bold; margin-bottom: 8px;">
          <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${e}; margin-right: 8px;"></span>
          <a href="${u}" target="_blank" style="color: #60a5fa; text-decoration: none;">${t.url}</a>
        </div>
        <div style="margin-bottom: 4px;"><strong>Location:</strong> ${t.location}</div>
        <div style="margin-bottom: 4px;"><strong>Status:</strong> ${t.status.charAt(0).toUpperCase()+t.status.slice(1)}</div>
        ${c?`<div style="margin-left: 16px; margin-top: 4px;">
          <a href="${c}" target="_blank" style="color: #a78bfa; text-decoration: none;">CU: ${c.replace(/^https?:\/\//,"").replace(/\/$/,"")}</a>
        </div>`:'<div style="margin-left: 16px; color: #9ca3af;">CU: Not Available</div>'}
      `}o.innerHTML=i,o.style.position="absolute",o.style.left=`${s.x+15}px`,o.style.top=`${s.y-10}px`,o.style.zIndex="1000";let r=!1,a=!0;o.addEventListener("mouseenter",()=>{r=!0}),o.addEventListener("mouseleave",()=>{r=!1,setTimeout(()=>{const u=document.getElementById("custom-globe-tooltip");u&&!u.matches(":hover")&&(this.hideCustomTooltip(),this.wasAutoRotating&&this.globe&&this.globe.controls()&&(this.globe.controls().autoRotate=!0))},100)}),this.currentTooltipData={isHoveringTooltip:r,isHoveringNode:a},document.body.appendChild(o)}hideCustomTooltip(){const t=document.getElementById("custom-globe-tooltip");t&&t.remove(),this.currentTooltipData&&(this.currentTooltipData.isHoveringNode=!1)}showNodeInfo(t){const s=document.getElementById("nodeInfo"),o=document.getElementById("nodeDetails"),e=t.cu&&t.cu!=="--"?`<div style="margin-bottom: 8px;">
           <strong>CU Endpoint:</strong> ${t.cu}
         </div>`:"";o.innerHTML=`
      <div style="margin-bottom: 15px;">
        <span class="node-status-indicator status-${t.status}"></span>
        <strong>${t.url}</strong>
      </div>
      <div style="margin-bottom: 8px;">
        <strong>Location:</strong> ${t.location}
      </div>
      <div style="margin-bottom: 8px;">
        <strong>Status:</strong> ${t.status.charAt(0).toUpperCase()+t.status.slice(1)}
      </div>
      <div style="margin-bottom: 8px;">
        <strong>Coordinates:</strong> ${t.lat.toFixed(4)}, ${t.lng.toFixed(4)}
      </div>
      ${e}
    `,s.classList.add("visible")}addCloudLayer(){try{this.globe&&this.globe.cloudsImageUrl("//unpkg.com/three-globe/example/img/earth-water.png").cloudsAltitude(.003).cloudsOpacity(.3)}catch(t){console.warn("Error adding cloud layer:",t)}}updateStats(){let t=0,s=0,o=0,e=0;this.nodeData.forEach(i=>{i.isCluster?(t+=i.clusterSize,s+=i.clusterStats.online,o+=i.clusterStats.busy,e+=i.clusterStats.offline):(t+=1,i.status==="online"?s++:i.status==="busy"?o++:i.status==="offline"&&e++)}),document.getElementById("totalNodes").textContent=t,document.getElementById("onlineNodes").textContent=s,document.getElementById("busyNodes").textContent=o,document.getElementById("offlineNodes").textContent=e}hideLoading(){this.refreshTimer=setInterval(()=>{console.log("🔄 Refreshing nodes..."),this.loadNodeData().then(()=>{this.globe.pointsData(this.nodeData),this.globe.ringsData(this.nodeData)})},300*1e3),console.log("⏰ Auto-refresh timer started (5 minutes)");const t=document.querySelector(".control-btn");t&&this.autoRotate&&(t.textContent="Stop Rotation",t.classList.add("active"))}}let n;function v(){if(n&&n.globe)try{n.autoRotate=!n.autoRotate;const l=n.globe.controls();l&&(l.autoRotate=n.autoRotate,n.autoRotate&&(l.autoRotateSpeed=.6));const t=event.target;t.textContent=n.autoRotate?"Stop Auto Rotate":"Start Auto Rotate",t.classList.toggle("active",n.autoRotate)}catch(l){console.warn("Auto-rotate not available:",l),event.target.textContent="Auto Rotate (N/A)",event.target.disabled=!0}}function x(){if(n&&n.globe)try{n.showLabels=!n.showLabels,event.target.textContent=n.showLabels?"Hide Node Labels":"Show Node Labels",event.target.classList.toggle("active",!n.showLabels)}catch(l){console.warn("Error toggling labels:",l)}}function w(){if(n&&n.globe)try{n.globe.pointOfView({lat:20,lng:-100,altitude:2},1e3)}catch(l){console.warn("Error resetting view:",l)}}function $(){document.getElementById("nodeInfo").classList.remove("visible")}function C(){window.location.href="../../index.html"}Object.assign(window,{goBack:C,toggleAutoRotate:v,toggleLabels:x,resetView:w,hideNodeInfo:$});window.addEventListener("load",()=>{n=new y});window.addEventListener("beforeunload",()=>{try{n&&n.globe&&typeof n.globe._destructor=="function"&&n.globe._destructor()}catch(l){console.warn("Error during cleanup:",l)}});
