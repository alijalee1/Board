/* GoodNotes-like (basic) web notebook
   - Pages
   - Pen/Highlighter/Eraser
   - Undo/Redo (per page)
   - Autosave to localStorage
   - Export current page to PNG
*/

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const penBtn = document.getElementById("penBtn");
const highBtn = document.getElementById("highBtn");
const eraserBtn = document.getElementById("eraserBtn");

const sizeRange = document.getElementById("size");
const sizeVal = document.getElementById("sizeVal");
const colorInput = document.getElementById("color");

const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");

const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");

const newPageBtn = document.getElementById("newPageBtn");
const pagesEl = document.getElementById("pages");

const STORAGE_KEY = "goodnotes_web_notebook_v1";

let state = loadState() || createDefaultState();
let currentTool = "pen"; // pen | highlighter | eraser

let drawing = false;
let last = null;

// ---------- State helpers ----------
function createDefaultState(){
  return {
    pages: [
      createPage("صفحة 1")
    ],
    currentPageId: null
  };
}
function createPage(title){
  return {
    id: crypto.randomUUID(),
    title,
    // strokes: list of {tool,color,size,points:[{x,y,t}]}
    strokes: [],
    undoStack: [],
    redoStack: []
  };
}

function saveState(){
  // لا نحفظ undo/redo كبيرة؟ نخليها، بس بسيط
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){
    return null;
  }
}

function getCurrentPage(){
  if(!state.currentPageId){
    state.currentPageId = state.pages[0].id;
  }
  return state.pages.find(p => p.id === state.currentPageId);
}

function setCurrentPage(id){
  state.currentPageId = id;
  renderPagesList();
  redrawAll();
  saveState();
}

// ---------- Tools ----------
function setTool(tool){
  currentTool = tool;
  [penBtn, highBtn, eraserBtn].forEach(b => b.classList.remove("active"));
  if(tool === "pen") penBtn.classList.add("active");
  if(tool === "highlighter") highBtn.classList.add("active");
  if(tool === "eraser") eraserBtn.classList.add("active");
}

penBtn.onclick = () => setTool("pen");
highBtn.onclick = () => setTool("highlighter");
eraserBtn.onclick = () => setTool("eraser");

sizeRange.oninput = () => (sizeVal.textContent = sizeRange.value);

// ---------- Drawing ----------
function getPos(e){
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  // تحويل لإحداثيات canvas الحقيقية
  const x = (clientX - rect.left) * (canvas.width / rect.width);
  const y = (clientY - rect.top) * (canvas.height / rect.height);
  return {x, y};
}

function beginStroke(pt){
  drawing = true;
  last = pt;

  const page = getCurrentPage();
  // حفظ snapshot للـ undo (خفيف: نخزن strokes كنسخة)
  page.undoStack.push(JSON.stringify(page.strokes));
  page.redoStack = [];

  const stroke = {
    tool: currentTool,
    color: colorInput.value,
    size: Number(sizeRange.value),
    points: [pt]
  };
  page.strokes.push(stroke);

  drawSegment(stroke, pt, pt, true);
}

function moveStroke(pt){
  if(!drawing) return;
  const page = getCurrentPage();
  const stroke = page.strokes[page.strokes.length - 1];
  stroke.points.push(pt);

  drawSegment(stroke, last, pt, false);
  last = pt;
}

function endStroke(){
  if(!drawing) return;
  drawing = false;
  last = null;

  // autosave
  saveState();
  // تحديث صورة المصغّر
  renderPagesList();
}

function drawSegment(stroke, a, b, isDot){
  ctx.save();

  if(stroke.tool === "eraser"){
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.lineWidth = stroke.size * 1.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  } else if(stroke.tool === "highlighter"){
    ctx.globalCompositeOperation = "multiply";
    ctx.strokeStyle = stroke.color;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = stroke.size * 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = stroke.color;
    ctx.globalAlpha = 1;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  ctx.beginPath();
  if(isDot){
    ctx.arc(a.x, a.y, Math.max(1, stroke.size/2), 0, Math.PI*2);
    ctx.fillStyle = ctx.strokeStyle;
    if(stroke.tool === "highlighter") ctx.globalAlpha = 0.28;
    ctx.fill();
  }else{
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  ctx.restore();
}

function redrawAll(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const page = getCurrentPage();
  for(const stroke of page.strokes){
    for(let i=0;i<stroke.points.length;i++){
      const p = stroke.points[i];
      const prev = stroke.points[i-1] || p;
      drawSegment(stroke, prev, p, i===0);
    }
  }
}

// Pointer events (mouse + touch)
canvas.addEventListener("mousedown", e => beginStroke(getPos(e)));
canvas.addEventListener("mousemove", e => moveStroke(getPos(e)));
window.addEventListener("mouseup", endStroke);

canvas.addEventListener("touchstart", e => { e.preventDefault(); beginStroke(getPos(e)); }, {passive:false});
canvas.addEventListener("touchmove", e => { e.preventDefault(); moveStroke(getPos(e)); }, {passive:false});
canvas.addEventListener("touchend", e => { e.preventDefault(); endStroke(); }, {passive:false});

// ---------- Undo/Redo/Clear/Export ----------
undoBtn.onclick = () => {
  const page = getCurrentPage();
  if(page.undoStack.length === 0) return;
  page.redoStack.push(JSON.stringify(page.strokes));
  page.strokes = JSON.parse(page.undoStack.pop());
  redrawAll();
  saveState();
  renderPagesList();
};

redoBtn.onclick = () => {
  const page = getCurrentPage();
  if(page.redoStack.length === 0) return;
  page.undoStack.push(JSON.stringify(page.strokes));
  page.strokes = JSON.parse(page.redoStack.pop());
  redrawAll();
  saveState();
  renderPagesList();
};

clearBtn.onclick = () => {
  const page = getCurrentPage();
  page.undoStack.push(JSON.stringify(page.strokes));
  page.redoStack = [];
  page.strokes = [];
  redrawAll();
  saveState();
  renderPagesList();
};

exportBtn.onclick = () => {
  const link = document.createElement("a");
  link.download = `${getCurrentPage().title}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
};

// ---------- Pages UI ----------
newPageBtn.onclick = () => {
  const n = state.pages.length + 1;
  const p = createPage(`صفحة ${n}`);
  state.pages.unshift(p);
  setCurrentPage(p.id);
  saveState();
};

function renderPagesList(){
  const currentId = getCurrentPage().id;
  pagesEl.innerHTML = "";

  for(const p of state.pages){
    const div = document.createElement("div");
    div.className = "pageThumb" + (p.id === currentId ? " active" : "");
    div.onclick = () => setCurrentPage(p.id);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<span>${p.title}</span><span>${p.strokes.length} ✍️</span>`;

    const img = document.createElement("img");
    img.alt = p.title;

    // نصنع thumbnail مؤقت: نرسم الصفحة في canvas مخفي صغير
    img.src = makeThumbnailDataURL(p);

    div.appendChild(meta);
    div.appendChild(img);
    pagesEl.appendChild(div);
  }
}

function makeThumbnailDataURL(page){
  const w = 220, h = Math.round(220 * (canvas.height/canvas.width));
  const off = document.createElement("canvas");
  off.width = w; off.height = h;
  const c = off.getContext("2d");
  c.fillStyle = "#fff";
  c.fillRect(0,0,w,h);

  // رسم strokes مع تحويل المقاس
  const sx = w / canvas.width;
  const sy = h / canvas.height;

  for(const stroke of page.strokes){
    for(let i=0;i<stroke.points.length;i++){
      const p = stroke.points[i];
      const prev = stroke.points[i-1] || p;

      const scaled = {
        tool: stroke.tool,
        color: stroke.color,
        size: stroke.size * sx,
        points: [{x:prev.x*sx,y:prev.y*sy},{x:p.x*sx,y:p.y*sy}]
      };

      // نقطة أولى
      if(i===0){
        const dot = {x:p.x*sx, y:p.y*sy};
        c.save();
        if(stroke.tool === "eraser"){
          c.globalCompositeOperation="destination-out";
          c.fillStyle="rgba(0,0,0,1)";
          c.beginPath();
          c.arc(dot.x,dot.y,Math.max(1,scaled.size/2),0,Math.PI*2);
          c.fill();
        }else if(stroke.tool==="highlighter"){
          c.globalCompositeOperation="multiply";
          c.globalAlpha=0.28;
          c.fillStyle=stroke.color;
          c.beginPath();
          c.arc(dot.x,dot.y,Math.max(1,scaled.size),0,Math.PI*2);
          c.fill();
        }else{
          c.globalCompositeOperation="source-over";
          c.globalAlpha=1;
          c.fillStyle=stroke.color;
          c.beginPath();
          c.arc(dot.x,dot.y,Math.max(1,scaled.size/2),0,Math.PI*2);
          c.fill();
        }
        c.restore();
      } else {
        // خط
        c.save();
        if(stroke.tool === "eraser"){
          c.globalCompositeOperation="destination-out";
          c.strokeStyle="rgba(0,0,0,1)";
          c.lineWidth=scaled.size*1.2;
        }else if(stroke.tool === "highlighter"){
          c.globalCompositeOperation="multiply";
          c.strokeStyle=stroke.color;
          c.globalAlpha=0.28;
          c.lineWidth=scaled.size*2.2;
        }else{
          c.globalCompositeOperation="source-over";
          c.strokeStyle=stroke.color;
          c.globalAlpha=1;
          c.lineWidth=scaled.size;
        }
        c.lineCap="round"; c.lineJoin="round";
        c.beginPath();
        c.moveTo(prev.x*sx, prev.y*sy);
        c.lineTo(p.x*sx, p.y*sy);
        c.stroke();
        c.restore();
      }
    }
  }

  return off.toDataURL("image/png");
}

// ---------- Boot ----------
(function init(){
  // لو الصفحة الحالية غير موجودة (تلف)، رجع للأولى
  if(!state.pages.length) state.pages = [createPage("صفحة 1")];
  if(!state.currentPageId || !state.pages.some(p=>p.id===state.currentPageId)){
    state.currentPageId = state.pages[0].id;
  }

  sizeVal.textContent = sizeRange.value;
  setTool("pen");
  renderPagesList();
  redrawAll();
  saveState();
})();
