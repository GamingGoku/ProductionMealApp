
const CACHE_NAME="meal-planner-modern-v11"; // bump cache for lock build
const OFFLINE_URL="offline.html";
const PRECACHE_ASSETS=["/","offline.html","manifest.json","app.js","meals.json"];

self.addEventListener("install",(event)=>{
  event.waitUntil(caches.open(CACHE_NAME).then((cache)=>cache.addAll(PRECACHE_ASSETS)));
});
self.addEventListener("activate",(event)=>{
  event.waitUntil(caches.keys().then((keys)=>Promise.all(keys.map((key)=>key!==CACHE_NAME&&caches.delete(key)))));
});
self.addEventListener("fetch",(event)=>{
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then((response)=>{
    if(response) return response;
    if(event.request.mode==="navigate") return caches.match(OFFLINE_URL);
  })));
});
