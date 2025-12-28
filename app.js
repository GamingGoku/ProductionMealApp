// App with Lock feature + staples + extras + date labels + drag/drop + quantity counts
let meals = []; let staples = []; let plan = [];
const CHECKED_KEY='shopping_checked_v1', PLAN_KEY='meal_plan_v2', EXTRAS_KEY='shopping_extras_v1', LOCK_KEY='plan_locked_v1';
const CAT_OVERRIDE_KEY='shopping_cat_override_v1';
const QTY_KEY='shopping_qty_v1';
const OPEN_CATS_KEY='shopping_open_cats_v1';
const CUSTOM_MEALS_KEY='custom_meals_v1';

function loadJSON(key, fallback){
  try{
    const raw=localStorage.getItem(key);
    if(raw==null) return fallback;
    const val=JSON.parse(raw);
    return val ?? fallback;
  }catch{ return fallback; }
}
function saveJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

let customMeals = [];

function sanitizeMeal(m){
  if(!m || typeof m !== 'object') return null;
  const name = String(m.name||'').trim();
  if(!name) return null;
  return {
    name,
    mainDish: String(m.mainDish||'Imported').trim(),
    sideDish: String(m.sideDish||'').trim(),
    ingredients: normalizeIngredients(m.ingredients||[]),
    method: Array.isArray(m.method)?m.method.map(x=>String(x).trim()).filter(Boolean):[]
  };
}

function loadCustomMeals(){
  const raw = loadJSON(CUSTOM_MEALS_KEY, []);
  if(Array.isArray(raw)) customMeals = raw.map(sanitizeMeal).filter(Boolean);
  else customMeals = [];
}

function saveCustomMeals(){
  saveJSON(CUSTOM_MEALS_KEY, customMeals);
}


function normalizeKey(s){
  return String(s||'')
    .toLowerCase()
    .trim()
    .replace(/['’`]/g,'')
    .replace(/[^a-z0-9]+/g,' ')
    .trim()
    .replace(/\s+/g,' ');
}
function escapeRegExp(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function hasPhrase(norm, phrase){
  const p=normalizeKey(phrase);
  if(!p) return false;
  const re=new RegExp(`(^|\\s)${escapeRegExp(p)}(\\s|$)`);
  return re.test(norm);
}

function hashKey(s){
  // Stable small hash for DOM ids (prevents collisions from punctuation changes)
  let h=0;
  const str=String(s||'');
  for(let i=0;i<str.length;i++){
    h=((h<<5)-h) + str.charCodeAt(i);
    h|=0;
  }
  return Math.abs(h).toString(36);
}

const isShopMode = (()=> {
  try{
    const u=new URL(window.location.href);
    return u.searchParams.get('mode')==='shop' || /(^|&)mode=shop(&|$)/.test(u.hash.replace('#','')) || window.name==='ShopMode';
  }catch{ return window.name==='ShopMode'; }
})();

// storage-backed state
let checked=new Set((loadJSON(CHECKED_KEY, [])||[]).map(normalizeKey));
let extras=[];
let catOverride = loadJSON(CAT_OVERRIDE_KEY, {}) || {};
let qtyOverride = loadJSON(QTY_KEY, {}) || {};
let openCats = loadJSON(OPEN_CATS_KEY, {}) || {};
let isLocked = JSON.parse(localStorage.getItem(LOCK_KEY) || 'false');

function saveChecked(){ saveJSON(CHECKED_KEY, Array.from(checked)); }
function saveCatOverride(){ saveJSON(CAT_OVERRIDE_KEY, catOverride); }
function saveQtyOverride(){ saveJSON(QTY_KEY, qtyOverride); }

function saveOpenCats(){ saveJSON(OPEN_CATS_KEY, openCats); }

// --- Date helpers ---
function toYMD(d){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function fromYMD(ymd){
  const [y,m,d]=String(ymd||'').split('-').map(Number);
  if(!y||!m||!d) return new Date();
  return new Date(y,m-1,d);
}
function addDaysLocal(date,days){
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()+days);
}
function formatDateLabel(date){
  return new Intl.DateTimeFormat('en-IE',{weekday:'short', day:'numeric', month:'short', year:'numeric'}).format(date);
}
function labelForDayIndex(dayIndex, startYMD){
  const start=fromYMD(startYMD);
  const d=addDaysLocal(start, dayIndex);
  return formatDateLabel(d);
}

function clampInt(n, min, max, fallback){
  const x = Number(n);
  if(!Number.isFinite(x)) return fallback;
  const v = Math.trunc(x);
  if(v < min || v > max) return fallback;
  return v;
}

function getSelectedPlanDays(){
  const el = document.getElementById('days-count');
  return clampInt(el?.value, 1, 60, planDays || 30);
}

function syncPlanDaysUI(){
  const sel = document.getElementById('days-count');
  if(sel){
    sel.value = String(planDays || 30);
  }
  const genBtn = document.getElementById('btn-generate');
  const title = document.getElementById('plan-title');
  const n = planDays || 30;
  if(genBtn) genBtn.textContent = `Generate ${n}‑Day Plan`;
  if(title) title.textContent = `${n}‑Day Plan`;
}

function saveChecked(){ localStorage.setItem(CHECKED_KEY, JSON.stringify([...checked])); }

let startYMD = toYMD(new Date()); // default; overwritten on load/generate
let planDays = 30;

function savePlan(){
  const obj = { days: plan, startYMD, numDays: planDays };
  localStorage.setItem(PLAN_KEY, JSON.stringify(obj));
}
function loadPlan(){
  try{
    const raw = localStorage.getItem(PLAN_KEY);
    if(!raw){
      // migrate from old array-only storage if present under old key
      const legacy = JSON.parse(localStorage.getItem('meal_plan_v1')||'[]');
      if(Array.isArray(legacy) && legacy.length){
        plan = legacy;
        startYMD = toYMD(new Date());
        planDays = plan.length || 30;
        savePlan();
        return;
      }
      return;
    }
    const p=JSON.parse(raw);
    if(Array.isArray(p)){
      // super-legacy array form
      plan = p;
      startYMD = toYMD(new Date());
      planDays = plan.length || 30;
      savePlan();
    } else if(p && Array.isArray(p.days)){
      plan = p.days;
      startYMD = p.startYMD || toYMD(new Date());
      planDays = Number(p.numDays) || plan.length || 30;
    }
  }catch(_){}
}
function loadExtras(){ try{ const x=JSON.parse(localStorage.getItem(EXTRAS_KEY)||'[]'); if(Array.isArray(x)) extras=x; }catch{} }
function saveExtras(){ localStorage.setItem(EXTRAS_KEY, JSON.stringify(extras)); }
function setLocked(v){ isLocked=!!v; localStorage.setItem(LOCK_KEY, JSON.stringify(isLocked)); updateLockUI(); }

function updateLockUI(){
  const lockBtn = document.getElementById('btn-lock');
  const genBtn  = document.getElementById('btn-generate');
  const clearBtn= document.getElementById('btn-clear');
  const banner  = document.getElementById('lock-banner');
  const shopBtn = document.getElementById('btn-shopping');
  const daysSel = document.getElementById('days-count');

  if(isLocked){
    if(lockBtn) lockBtn.textContent = 'Unlock Plan';
    if(genBtn)  genBtn.setAttribute('disabled','true');
    if(daysSel) daysSel.setAttribute('disabled','true');
    if(clearBtn)clearBtn.setAttribute('disabled','true');
    if(banner)  banner.style.display = 'block';
  }else{
    if(lockBtn) lockBtn.textContent = 'Lock Plan';
    if(genBtn)  genBtn.removeAttribute('disabled');
    if(daysSel) daysSel.removeAttribute('disabled');
    if(clearBtn)clearBtn.removeAttribute('disabled');
    if(banner)  banner.style.display = 'none';
  }

  // Shopping list availability once a plan exists
  if(shopBtn){
    if(plan.length > 0){
      shopBtn.removeAttribute('disabled');
    } else {
      shopBtn.setAttribute('disabled','true');
    }
  }
}

function normalizeIngredients(ings){ const out=[]; for(const raw of (ings||[])){ if(typeof raw!=='string') continue; const s=raw.trim(); if(s) out.push(s);} return out; }
function normalizeItemName(s){ return (s||'').trim().replace(/\s+/g,' '); }
function shuffle(a){ return a.slice().sort(()=>Math.random()-0.5); }

const CATEGORIES_ORDER=['Produce','Meat & Fish','Dairy & Eggs','Pantry','Household','Toiletries','Cleaning','Other'];

// Keyword lists are matched on *normalized whole words/phrases* (no substring matching).
const CATEGORY={
  produce:['onion','garlic','pepper','lime','lemon','broccoli','courgette','zucchini','mushroom','spinach','lettuce','cucumber','avocado','potato','carrot','tomato','basil','spring onion','green onion','scallion','pepper','chilli','chili','ginger'],
  dairy:['milk','cream','yoghurt','yogurt','butter','cheese','parmesan','mozzarella','egg','eggs'],
  protein:['beef','steak','chicken','pork','ham','bacon','fish','salmon','tuna','prawn','prawns','shrimp','mince','sausages','sausage','burger','hamburger','pepperoni','hot dog','hot dogs'],
  pantry:['soy sauce','vinegar','oil','rice','noodle','flour','salt','sugar','pasta','noodles','lentil','beans','kidney beans','chickpeas','tinned','canned','tin','jar','pesto','mayonnaise','ketchup','mustard','bread','wrap','tortilla','stock','broth','stock cube','stock cubes'],
  household:['bin bag','bin bags','foil','cling film','batteries','light bulb','kitchen roll','paper towel','bin liners','zip lock','baking paper','tin foil'],
  toiletries:['shampoo','conditioner','toothpaste','toothbrush','deodorant','shower gel','wipes'],
  cleaning:['bleach','detergent','dishwasher','washing up','washing powder','fabric softener','sponges','spray','cleaner','toilet cleaner']
};

const NON_FRESH_MODIFIERS=['powder','ground','granules','flakes','dried','dry','frozen','tinned','canned','jar','paste','sauce','stock','broth','cube','seasoning','spice','mix'];
const SPICE_WORDS=['spice','spices','seasoning','powder','ground','granules','flakes','herb','herbs','curry','paprika','cumin','turmeric','garam masala','oregano','thyme','rosemary'];

function categoryOf(item){
  const norm = normalizeKey(item);
  if(!norm) return 'Other';

  // Specific, high-impact fixes
  if(hasPhrase(norm,'garlic powder') || hasPhrase(norm,'onion powder')) return 'Other';
  if(hasPhrase(norm,'coconut milk')) return 'Pantry';

  // Non-food / household first
  if(CATEGORY.cleaning.some(k=>hasPhrase(norm,k))) return 'Cleaning';
  if(CATEGORY.toiletries.some(k=>hasPhrase(norm,k))) return 'Toiletries';
  if(CATEGORY.household.some(k=>hasPhrase(norm,k))) return 'Household';

  // Pantry-like modifiers should override produce/meat/dairy (e.g., chicken stock)
  if(['stock','broth','stock cube','stock cubes'].some(k=>hasPhrase(norm,k))) return 'Pantry';

  // Spices/seasonings live in Other by default
  if(SPICE_WORDS.some(k=>hasPhrase(norm,k))) return 'Other';

  if(CATEGORY.dairy.some(k=>hasPhrase(norm,k))) return 'Dairy & Eggs';
  if(CATEGORY.protein.some(k=>hasPhrase(norm,k))) return 'Meat & Fish';

  const isProduce = CATEGORY.produce.some(k=>hasPhrase(norm,k));
  if(isProduce){
    // If it's clearly a pantry/spice form, keep it out of Produce.
    if(NON_FRESH_MODIFIERS.some(k=>hasPhrase(norm,k))) return 'Other';
    return 'Produce';
  }

  if(CATEGORY.pantry.some(k=>hasPhrase(norm,k))) return 'Pantry';
  return 'Other';
}


async function loadMealsAndStaples(){
  try{
    const res=await fetch('meals.json',{cache:'no-store'});
    if(!res.ok) throw new Error('meals.json not found');
    const data=await res.json();
    if(Array.isArray(data)){ meals=data; staples=[]; }
    else if(data && Array.isArray(data.meals)){ meals=data.meals; staples=Array.isArray(data.staples)?data.staples:[]; }
    else throw new Error('Invalid meals.json structure');
    meals = meals.map(m=>({
      name:m.name||'',
      mainDish:m.mainDish||'',
      sideDish:m.sideDish||'',
      ingredients:normalizeIngredients(m.ingredients||[]),
      method:Array.isArray(m.method)?m.method.map(x=>String(x).trim()).filter(Boolean):[]
    }));
    loadCustomMeals();
    if(customMeals.length){
      const byName = new Map(meals.map(m=>[normalizeKey(m.name), m]));
      for(const cm of customMeals){
        const k = normalizeKey(cm.name);
        if(!byName.has(k)) byName.set(k, cm);
      }
      meals = Array.from(byName.values());
    }

  }catch(err){
    console.warn('Meals load failed, using fallback:', err);
    meals=[{name:'Pepper Steak Stir Fry', mainDish:'Beef', sideDish:'Rice', ingredients:['Steak','Red Bell Pepper','Garlic','Soy Sauce']}];
    loadCustomMeals();
    if(customMeals.length){
      const byName = new Map(meals.map(m=>[normalizeKey(m.name), m]));
      for(const cm of customMeals){
        const k = normalizeKey(cm.name);
        if(!byName.has(k)) byName.set(k, cm);
      }
      meals = Array.from(byName.values());
    }

    staples = Array.isArray(staples)?staples:[];
  }
}

function renderPlan(){
  const wrap=document.getElementById('plan');
  if(!plan.length){ wrap.innerHTML=`<div class="muted">No plan yet. Click “Generate ${planDays}‑Day Plan”.</div>`; return; }

  const grid=document.createElement('div'); grid.className='grid-30';

  plan.forEach((m,i)=>{
    const d=document.createElement('div'); d.className='day'; d.setAttribute('draggable','true'); d.dataset.index=i;
    d.innerHTML='<div class="kicker">'+labelForDayIndex(i,startYMD)+'</div>' +
                '<div class="meal">'+m.name+'</div>' +
                '<div class="muted">'+m.mainDish+' • '+m.sideDish+'</div>';

    // Drag & drop handlers
    d.addEventListener('dragstart', e=>{
      e.dataTransfer.setData('text/plain', String(i));
      d.classList.add('dragging');
    });
    d.addEventListener('dragend', ()=>d.classList.remove('dragging'));
    d.addEventListener('dragover', e=>{ e.preventDefault(); });
    d.addEventListener('drop', e=>{
      e.preventDefault();
      const srcIndex=parseInt(e.dataTransfer.getData('text/plain'),10);
      const targetIndex=parseInt(d.dataset.index,10);
      if(isNaN(srcIndex)||isNaN(targetIndex)||srcIndex===targetIndex) return;
      const tmp=plan[srcIndex];
      plan[srcIndex]=plan[targetIndex];
      plan[targetIndex]=tmp;
      savePlan();
      renderPlan();
    });

    grid.appendChild(d);
  });
  wrap.innerHTML=''; wrap.appendChild(grid);
}



function renderRecipes(){
  const wrap = document.getElementById('recipes');
  if(!wrap) return;

  loadPlan();
  if(!plan.length){
    wrap.innerHTML = '<div class="muted">Generate a plan first to see recipes in the same order as your menu.</div>';
    return;
  }

  const byName = new Map(meals.map(m=>[normalizeKey(m.name), m]));
  const frag = document.createDocumentFragment();

  plan.forEach((pm, i)=>{
    const meal = byName.get(normalizeKey(pm.name)) || pm;

    const details = document.createElement('details');
    details.className = 'recipe';
    if(i === 0) details.open = true;

    const summary = document.createElement('summary');

    const meta = document.createElement('div');
    meta.className = 'recipe-meta';
    meta.textContent = `Day ${i+1} • ${labelForDayIndex(i, startYMD)}`;

    const title = document.createElement('div');
    title.className = 'recipe-title';
    title.textContent = meal.name || 'Meal';

    const sub = document.createElement('div');
    sub.className = 'muted';
    sub.style.fontSize = '12px';
    sub.textContent = `${meal.mainDish||''}${meal.sideDish ? ' • ' + meal.sideDish : ''}`.trim();

    summary.appendChild(meta);
    summary.appendChild(title);
    if(sub.textContent) summary.appendChild(sub);

    const body = document.createElement('div');
    body.className = 'recipe-body';

    const hIng = document.createElement('h4');
    hIng.textContent = 'Ingredients';
    body.appendChild(hIng);

    const ul = document.createElement('ul');
    for(const ing of (meal.ingredients||[])){
      const li = document.createElement('li');
      li.textContent = String(ing||'').trim();
      ul.appendChild(li);
    }
    body.appendChild(ul);

    const steps = Array.isArray(meal.method) ? meal.method : (Array.isArray(meal.steps) ? meal.steps : null);

    const hSteps = document.createElement('h4');
    hSteps.textContent = 'Method';
    body.appendChild(hSteps);

    if(steps && steps.length){
      const ol = document.createElement('ol');
      for(const s of steps){
        const li = document.createElement('li');
        li.textContent = String(s||'').trim();
        ol.appendChild(li);
      }
      body.appendChild(ol);
    }else{
      const p = document.createElement('div');
      p.className = 'muted';
      p.textContent = 'No cooking instructions saved for this meal.';
      body.appendChild(p);
    }

    details.appendChild(summary);
    details.appendChild(body);
    frag.appendChild(details);
  });

  wrap.replaceChildren(frag);
}
function generatePlan(){
  if(isLocked){ alert('Plan is locked. Unlock to generate a new plan.'); return; }
  planDays = getSelectedPlanDays();
  syncPlanDaysUI();

  const unique = Array.from(new Map(meals.map(m=>[m.name,m])).values());
  // Safety: if fewer meals than requested days, cap to available unique meals.
  const n = Math.min(planDays, unique.length || planDays);
  plan = unique.slice().sort(()=>Math.random()-0.5).slice(0, n);

  startYMD = toYMD(new Date());
  savePlan();
  renderPlan();
  updateLockUI();

  // Keep recipes in sync if user is viewing them
  if(document.querySelector('[data-nav="recipes"]')?.classList.contains('active')){
    renderRecipes();
  }

  // Auto-navigate to shopping and build list
  const shoppingTab = document.querySelector('[data-nav="shopping"]');
  if (shoppingTab && !shoppingTab.classList.contains('active')) shoppingTab.click();
  buildShoppingList();
}

function buildShoppingList(){
  const container=document.getElementById('shopping');
  if(!container) return;

  // Refresh state (supports multiple windows via localStorage)
  checked = new Set((loadJSON(CHECKED_KEY, [])||[]).map(normalizeKey));
  catOverride = loadJSON(CAT_OVERRIDE_KEY, {}) || {};
  qtyOverride = loadJSON(QTY_KEY, {}) || {};
  openCats = loadJSON(OPEN_CATS_KEY, {}) || {};
  loadExtras();
  loadPlan();
  syncPlanDaysUI();

  if(!plan.length){
    container.innerHTML='<div class="muted">Generate a plan first.</div>';
    return;
  }

  const counts = {};    // key -> occurrence count
  const labels = {};    // key -> first-seen label
  const forcedCats = {}; // key -> forced category (extras selection)

  const collect = (name, forcedCat='') => {
    const raw=String(name||'').trim();
    if(!raw) return;
    const key=normalizeKey(raw);
    if(!key) return;
    counts[key]=(counts[key]||0)+1;
    if(!labels[key]) labels[key]=raw;
    if(forcedCat) forcedCats[key]=forcedCat;
  };

  for(const m of plan){ for(const ing of (m.ingredients||[])) collect(ing); }
  for(const s of (staples||[])) collect(s);
  for(const e of (extras||[])){
    if(typeof e==='string') collect(e);
    else if(e && typeof e==='object') collect(e.name, e.cat||'');
  }

  const groups = {}; // cat -> array of keys
  for(const key of Object.keys(labels)){
    const forced = forcedCats[key] || '';
    const over = catOverride[key] || '';
    const cat = forced || over || categoryOf(labels[key]);
    (groups[cat] ||= []).push(key);
  }

  const frag=document.createDocumentFragment();

  for(const cat of CATEGORIES_ORDER){
    const keys = groups[cat];
    if(!keys || !keys.length) continue;

    keys.sort((a,b)=> (labels[a]||a).localeCompare(labels[b]||b));

    const det=document.createElement('details');
    det.className='catgroup';
    // Default: collapsed in normal mode, expanded in Shop Mode unless user has chosen otherwise
    const hasUserPref = Object.prototype.hasOwnProperty.call(openCats, cat);
    if(hasUserPref ? !!openCats[cat] : isShopMode) det.open=true;

    const summary=document.createElement('summary');
    summary.className='cat-ribbon';

    const nameSpan=document.createElement('span');
    nameSpan.className='cat-name';
    nameSpan.textContent=cat;

    const metaSpan=document.createElement('span');
    metaSpan.className='cat-meta';
    summary.appendChild(nameSpan);
    summary.appendChild(metaSpan);

    // Persist open/closed
    det.addEventListener('toggle', ()=>{
      openCats[cat]=!!det.open;
      saveOpenCats();
    });

    det.appendChild(summary);

    const list=document.createElement('div');
    list.className='catitems';
    det.appendChild(list);

    const updateMeta=()=>{
      const total=keys.length;
      let done=0;
      for(const k of keys) if(checked.has(k)) done++;
      metaSpan.textContent = `${done}/${total}`;
    };
    updateMeta();

    frag.appendChild(det);

    for(const key of keys){
      const row=document.createElement('div');
      row.className='item' + (checked.has(key)?' checked':'');

      const id='it_'+hashKey(key);

      const input=document.createElement('input');
      input.type='checkbox';
      input.id=id;
      input.checked=checked.has(key);

      const label=document.createElement('label');
      label.htmlFor=id;
      label.textContent=labels[key] || key;

      input.addEventListener('change', ()=>{
        if(input.checked) checked.add(key); else checked.delete(key);
        saveChecked();
        row.classList.toggle('checked', input.checked);
        updateMeta();
      });

      row.appendChild(input);
      row.appendChild(label);

      const baseCount = counts[key] || 1;
      const qty = ((qtyOverride[key] ?? '').trim() || String(baseCount));

      if(isShopMode){
        if(qty){
          const pill=document.createElement('span');
          pill.className='pill';
          pill.textContent=`× ${qty}`;
          row.appendChild(pill);
        }
      }else{
        // Quantity editor
        const q=document.createElement('input');
        q.type='text';
        q.className='qty';
        q.value=(qtyOverride[key] ?? String(baseCount));
        q.placeholder='Qty';
        q.title='Quantity (e.g., 2, 500g, 1L)';
        q.addEventListener('change', ()=>{
          const v=String(q.value||'').trim();
          if(v && v !== String(baseCount)) qtyOverride[key]=v;
          else delete qtyOverride[key];
          saveQtyOverride();
          // Always show a quantity: override or auto count
          q.value = (qtyOverride[key] ?? String(baseCount));
        });
        row.appendChild(q);

        // Category override dropdown
        const sel=document.createElement('select');
        sel.className='cat';
        const optAuto=document.createElement('option');
        optAuto.value='';
        optAuto.textContent='Auto';
        sel.appendChild(optAuto);
        for(const c of CATEGORIES_ORDER){
          const o=document.createElement('option');
          o.value=c;
          o.textContent=c;
          sel.appendChild(o);
        }
        sel.value = catOverride[key] || '';
        sel.title='Override category';
        sel.addEventListener('change', ()=>{
          const v=sel.value;
          if(v) catOverride[key]=v; else delete catOverride[key];
          saveCatOverride();
          buildShoppingList();
        });
        row.appendChild(sel);
      }

      list.appendChild(row);
    }
  }

  container.replaceChildren(frag);
}


function clearChecked(){ checked=new Set(); saveChecked(); buildShoppingList(); }

function loadFromFile(){
  const file=document.getElementById('file')?.files?.[0]; if(!file) return alert('Choose a JSON file first.');
  const r=new FileReader();
  r.onload=()=>{
    try{
      const data=JSON.parse(r.result);
      if(Array.isArray(data)){ meals=data; staples=[]; } else { meals=data.meals||[]; staples=data.staples||[]; }
      alert('Loaded '+meals.length+' meals and '+(staples.length||0)+' staples');
    }catch(e){ alert('Invalid JSON'); }
  };
  r.readAsText(file,'utf-8');
}
function loadFromPaste(){
  const txt=document.getElementById('paste')?.value?.trim(); if(!txt) return alert('Paste your JSON first.');
  try{
    const data=JSON.parse(txt);
    if(Array.isArray(data)){ meals=data; staples=[]; } else { meals=data.meals||[]; staples=data.staples||[]; }
    alert('Loaded '+meals.length+' meals and '+(staples.length||0)+' staples');
  }catch(e){ alert('Invalid JSON'); }
}



// --- Recipe import (URL -> ingredients) ---
function isHttpUrl(s){
  try{
    const u = new URL(String(s||''));
    return u.protocol === 'http:' || u.protocol === 'https:';
  }catch{ return false; }
}

function findFirstRecipeSchema(node){
  if(!node) return null;
  if(Array.isArray(node)){
    for(const x of node){
      const r = findFirstRecipeSchema(x);
      if(r) return r;
    }
    return null;
  }
  if(typeof node !== 'object') return null;

  const t = node['@type'];
  if(typeof t === 'string' && t.toLowerCase() === 'recipe') return node;
  if(Array.isArray(t) && t.map(x => String(x).toLowerCase()).includes('recipe')) return node;

  if(node['@graph']){
    const r = findFirstRecipeSchema(node['@graph']);
    if(r) return r;
  }
  if(node.mainEntity){
    const r = findFirstRecipeSchema(node.mainEntity);
    if(r) return r;
  }

  for(const k of Object.keys(node)){
    const v = node[k];
    if(v && typeof v === 'object'){
      const r = findFirstRecipeSchema(v);
      if(r) return r;
    }
  }
  return null;
}

function parseRecipeFromHtml(html){
  const doc = new DOMParser().parseFromString(String(html||''), 'text/html');
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  for(const sc of scripts){
    const raw = String(sc.textContent||'').trim();
    if(!raw) continue;
    try{
      const data = JSON.parse(raw);
      const recipe = findFirstRecipeSchema(data);
      if(recipe){
        const title = String(recipe.name||recipe.headline||'').trim() || 'Imported recipe';
        const ings = Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : (Array.isArray(recipe.ingredients) ? recipe.ingredients : []);
        const ingredients = (ings||[]).filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean);
        if(ingredients.length) return { title, ingredients };
      }
    }catch{}
  }
  throw new Error('No Recipe schema found on that page.');
}

async function importRecipeFromUrl(url){
  const u = String(url||'').trim();
  if(!isHttpUrl(u)) throw new Error('Please enter a valid http(s) URL.');

  // If you later deploy via Git/CLI with Netlify Functions, this endpoint can exist.
  try{
    const fnUrl = '/.netlify/functions/importRecipe?url=' + encodeURIComponent(u);
    const r = await fetch(fnUrl, { cache: 'no-store' });
    if(r.ok){
      const data = await r.json();
      if(data && Array.isArray(data.ingredients)) return { title: String(data.title||data.name||'').trim() || 'Imported recipe', ingredients: data.ingredients };
    }
  }catch{}

  // Static-friendly path (public CORS proxy)
  const proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u);
  const res = await fetch(proxy, { cache: 'no-store' });
  if(!res.ok) throw new Error('Could not fetch recipe page (proxy error).');
  const html = await res.text();
  return parseRecipeFromHtml(html);
}

function removeParenText(s){
  let out = '';
  let depth = 0;
  for(const ch of String(s||'')){
    if(ch==='('){ depth += 1; continue; }
    if(ch===')'){ if(depth>0) depth -= 1; continue; }
    if(depth===0) out += ch;
  }
  return out;
}

function collapseSpaces(s){
  const parts = String(s||'').split(' ').filter(Boolean);
  return parts.join(' ');
}

function isFractionToken(t){
  return ['½','¼','¾','⅓','⅔','⅛','⅜','⅝','⅞'].includes(String(t||''));
}

function isNumberLikeToken(t){
  const s = String(t||'').trim();
  if(!s) return false;
  if(isFractionToken(s)) return true;
  const allowed = '0123456789/.';
  for(const ch of s){
    if(!allowed.includes(ch)) return false;
  }
  return true;
}

function parseIngredientLine(line){
  let s = String(line||'').trim();
  if(!s) return null;

  // strip common bullet prefixes
  if(s[0]==='•' || s[0]==='-' || s[0]==='*') s = s.slice(1).trim();

  s = removeParenText(s);
  if(s.includes(',')) s = s.split(',')[0];
  s = collapseSpaces(s);

  const tokens = s.split(' ').filter(Boolean);
  if(!tokens.length) return null;

  const units = new Set(['cup','cups','tbsp','tablespoon','tablespoons','tsp','teaspoon','teaspoons','g','kg','ml','l','oz','lb','pound','pounds','slice','slices','clove','cloves','can','cans','pack','packs','packet','packets','pinch','dash','sprig','sprigs','bunch','bunches']);

  const qtyTokens = [];
  let i = 0;

  // leading quantity
  if(isNumberLikeToken(tokens[0])){
    qtyTokens.push(tokens[0]);
    i = 1;
    if(i < tokens.length && units.has(tokens[i].toLowerCase())){
      qtyTokens.push(tokens[i]);
      i += 1;
    }
  }

  let name = tokens.slice(i).join(' ');
  name = name.replace(/^of /i, '');
  name = collapseSpaces(name);

  const qty = qtyTokens.join(' ').trim();
  return { qty, name: normalizeItemName(name) };
}

function addImportedMealToRotation(title, ingredientLines){
  const cleanTitle = String(title||'').trim();
  if(!cleanTitle) throw new Error('Meal name is required.');

  const names = [];
  const lines = Array.isArray(ingredientLines) ? ingredientLines : [];

  for(const line of lines){
    const parsed = parseIngredientLine(line);
    if(!parsed || !parsed.name) continue;
    names.push(parsed.name);

    // Pre-fill quantity overrides if we extracted a qty and the user hasn't set one yet.
    const k = normalizeKey(parsed.name);
    if(parsed.qty && k && qtyOverride[k] == null){
      qtyOverride[k] = parsed.qty;
    }
  }

  const meal = { name: cleanTitle, mainDish: 'Imported', sideDish: '', ingredients: normalizeIngredients(names), method: [] };

  loadCustomMeals();
  const key = normalizeKey(meal.name);
  const existing = customMeals.find(m => normalizeKey(m.name) === key);
  if(existing){
    throw new Error('A meal with that name already exists.');
  }

  customMeals.push(meal);
  saveCustomMeals();

  // Update in-memory meals list
  meals.push(meal);

  // Persist quantities we just set
  saveQtyOverride();
}


function show(screen){ document.querySelectorAll('[data-screen]').forEach(s=>{ s.hidden = s.getAttribute('data-screen')!==screen; }); }

document.addEventListener('DOMContentLoaded', ()=>{
  const genBtn = document.getElementById('btn-generate');
  if(genBtn) genBtn.addEventListener('click', generatePlan);

  const daysSel = document.getElementById('days-count');
  if(daysSel){
    daysSel.addEventListener('change', ()=>{
      planDays = getSelectedPlanDays();
      syncPlanDaysUI();
      updateLockUI();
    });
  }

  const shopBtn = document.getElementById('btn-shopping');
  if(shopBtn) shopBtn.addEventListener('click', ()=>{ buildShoppingList(); show('shopping'); });

  const clearBtn = document.getElementById('btn-clear');
  if(clearBtn) clearBtn.addEventListener('click', ()=>{
    if(isLocked){ alert('Plan is locked. Unlock to clear.'); return; }
    plan=[]; savePlan(); renderPlan(); const s=document.getElementById('shopping'); if(s) s.innerHTML=''; const r=document.getElementById('recipes'); if(r) r.innerHTML=''; updateLockUI();
  });

  const clearCheckedBtn = document.getElementById('btn-clear-checked');
  if(clearCheckedBtn) clearCheckedBtn.addEventListener('click', clearChecked);

  const shopModeBtn = document.getElementById('btn-shop-mode');
  if(shopModeBtn) shopModeBtn.addEventListener('click', ()=>{
    try{
      const url = new URL(window.location.href);
      url.searchParams.set('mode','shop');
      const w = window.open(url.toString(), 'ShopMode', `popup=yes,width=${screen.availWidth},height=${screen.availHeight},left=0,top=0`);
      if(w){ w.name='ShopMode'; w.focus(); }
    }catch(e){
      // fallback
      const w = window.open(window.location.pathname + '?mode=shop', 'ShopMode');
      if(w){ w.name='ShopMode'; w.focus(); }
    }
  });

  const addExtraBtn = document.getElementById('btn-add-extra');
  const extraNameEl = document.getElementById('extra-name');
  const extraCatEl = document.getElementById('extra-cat');
  const addExtra = ()=>{
    const name = (extraNameEl?.value||'').trim();
    if(!name) return;
    const cat = (extraCatEl?.value||'').trim();
    extras.push({name, cat});
    saveExtras();
    extraNameEl.value='';
    if(!isShopMode){
      // stay on shopping
      buildShoppingList();
    }
  };
  if(addExtraBtn) addExtraBtn.addEventListener('click', addExtra);
  if(extraNameEl) extraNameEl.addEventListener('keydown', (e)=>{
    if(e.key==='Enter'){ e.preventDefault(); addExtra(); }
  });


  const loadFileBtn = document.getElementById('btn-load-file');
  if(loadFileBtn) loadFileBtn.addEventListener('click', loadFromFile);

  const loadPasteBtn = document.getElementById('btn-load-paste');
  if(loadPasteBtn) loadPasteBtn.addEventListener('click', loadFromPaste);

  const lockBtn = document.getElementById('btn-lock');
  if(lockBtn) lockBtn.addEventListener('click', ()=>{
    if(isLocked){
      if(confirm('Unlock the plan?')) setLocked(false);
    }else{
      if(!plan.length) { alert('Generate a plan first.'); return; }
      setLocked(true);
    }
  });

  document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active'); show(t.dataset.nav);
    if(t.dataset.nav==='shopping') buildShoppingList();
    if(t.dataset.nav==='plan') renderPlan();
    if(t.dataset.nav==='recipes') renderRecipes();
  }));

  // Recipe import dialog wiring
  const importBtn = document.getElementById('btn-import');
  const dlg = document.getElementById('import-dialog');
  const importUrl = document.getElementById('import-url');
  const importTitle = document.getElementById('import-title');
  const importIngredients = document.getElementById('import-ingredients');
  const importFetchBtn = document.getElementById('btn-import-fetch');
  const importAddBtn = document.getElementById('btn-import-add');
  const importStatus = document.getElementById('import-status');

  const resetImportDialog = () => {
    if(importUrl) importUrl.value = '';
    if(importTitle) importTitle.value = '';
    if(importIngredients) importIngredients.value = '';
    if(importStatus) importStatus.textContent = '';
  };

  if(importBtn && dlg && typeof dlg.showModal === 'function'){
    importBtn.addEventListener('click', ()=>{
      resetImportDialog();
      dlg.showModal();
      if(importUrl) importUrl.focus();
    });
  }

  if(importFetchBtn){
    importFetchBtn.addEventListener('click', async ()=>{
      try{
        if(importStatus) importStatus.textContent = 'Fetching recipe…';
        const url = String(importUrl?.value||'').trim();
        const data = await importRecipeFromUrl(url);
        if(importTitle) importTitle.value = data.title || '';
        if(importIngredients) importIngredients.value = (data.ingredients||[]).join(String.fromCharCode(10));
        if(importStatus) importStatus.textContent = 'Imported ingredients. Review and click “Add to rotation”.';
      }catch(e){
        if(importStatus) importStatus.textContent = String(e && e.message ? e.message : e);
      }
    });
  }

  if(importAddBtn){
    importAddBtn.addEventListener('click', ()=>{
      try{
        const title = String(importTitle?.value||'').trim();
        const lines = String(importIngredients?.value||'')
          .split(String.fromCharCode(10))
          .map(x=>x.trim())
          .filter(Boolean);
        addImportedMealToRotation(title, lines);
        alert('Added “' + title + '” to your rotation.');
        if(dlg) dlg.close();
      }catch(e){
        if(importStatus) importStatus.textContent = String(e && e.message ? e.message : e);
      }
    });
  }


  updateLockUI();
});


function runTests(){
  const failures=[];
  const expect=(label, actual, expected)=>{
    if(actual!==expected) failures.push(`${label}: expected "${expected}", got "${actual}"`);
  };

  // Categorization regressions
  expect('Shampoo category', categoryOf('Shampoo'), 'Toiletries');
  expect('Ham category', categoryOf('Ham'), 'Meat & Fish');
  expect('Garlic Powder category', categoryOf('Garlic Powder'), 'Other');
  expect('Chicken stock category', categoryOf('Chicken stock'), 'Pantry');
  expect('Coconut milk category', categoryOf('Coconut milk'), 'Pantry');

  // Normalization
  expect('normalizeKey trims/collapses', normalizeKey('  Garlic   Powder '), 'garlic powder');
  expect('normalizeKey removes apostrophes', normalizeKey("Chef's knife"), 'chefs knife');

  return failures;
}

(async function(){
  await loadMealsAndStaples();
  loadExtras();
  loadPlan();
  syncPlanDaysUI();

  if(isShopMode){
    document.body.classList.add('shop-mode');
    // Force shopping view
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    const t=document.querySelector('[data-nav="shopping"]');
    if(t) t.classList.add('active');
    show('shopping');
    buildShoppingList();
  }else{
    renderPlan();
  }

  updateLockUI();

  // Optional test runner: add ?test=1
  try{
    const u=new URL(window.location.href);
    if(u.searchParams.get('test')==='1'){
      const failures = runTests();
      const box=document.createElement('div');
      box.style.position='fixed';
      box.style.top='10px';
      box.style.left='10px';
      box.style.right='10px';
      box.style.zIndex='9999';
      box.style.padding='12px';
      box.style.border='1px solid #223041';
      box.style.background='rgba(16,22,29,0.95)';
      box.style.borderRadius='12px';
      box.style.maxHeight='50vh';
      box.style.overflow='auto';
      box.innerHTML = failures.length
        ? '<strong>Tests failed:</strong><br>' + failures.map(x=>`• ${x}`).join('<br>')
        : '<strong>All tests passed.</strong>';
      document.body.appendChild(box);
    }
  }catch{}
})();;


// Sync changes across multiple windows (e.g., main app + Shop Mode popup)
window.addEventListener('storage', (e)=>{
  if(!e || !e.key) return;
  const watched = [CHECKED_KEY, CAT_OVERRIDE_KEY, QTY_KEY, EXTRAS_KEY, PLAN_KEY, LOCK_KEY];
  if(!watched.includes(e.key)) return;

  if(e.key===PLAN_KEY) loadPlan();
  if(e.key===EXTRAS_KEY) loadExtras();
  if(e.key===LOCK_KEY){
    try{ isLocked = JSON.parse(localStorage.getItem(LOCK_KEY) || 'false'); }catch{}
    updateLockUI();
  }
  // Rebuild shopping list if visible or if we're in Shop Mode
  const shoppingTabActive = document.querySelector('[data-nav="shopping"]')?.classList.contains('active');
  if(isShopMode || shoppingTabActive){
    buildShoppingList();
  }
});


if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('sw.js').catch(err=>console.error('SW failed',err));
  });
}
