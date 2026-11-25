/* performance.js — master-data cache with automatic invalidation on writes.
   loadVehicles()/loadItems() keep identical results; repeated calls within 60 s reuse the fetched data.
   Any insert/update/upsert/delete on the table clears its cache so lists never go stale. */
(function(){
  var TTL = 60000, store = {}, TABLE = {loadVehicles:'vehicle_master', loadItems:'items'};
  function invalidate(t){ Object.keys(TABLE).forEach(function(k){ if (TABLE[k]===t) delete store[k]; }); }
  function hook(client){
    var orig = client.from.bind(client);
    client.from = function(t){
      var b = orig(t);
      ['insert','update','upsert','delete'].forEach(function(m){
        var f = b[m]; if (typeof f !== 'function') return;
        b[m] = function(){
          invalidate(t);
          var r = f.apply(this, arguments);
          if (r && typeof r.then === 'function'){ var th = r.then.bind(r); r.then = function(a,e){ return th(function(v){ invalidate(t); return a ? a(v) : v; }, e); }; }
          return r;
        };
      });
      return b;
    };
  }
  hook(db); hook(oilDb);
  function memo(name){
    var fn = window[name]; if (typeof fn !== 'function') return;
    window[name] = async function(){
      var e = store[name], now = Date.now();
      if (!(e && e.v && now - e.t < TTL)){
        if (!(e && e.p)){ var p = fn.apply(this, arguments); store[name] = {p:p, t:0}; p.then(function(v){ if (store[name] && store[name].p===p) store[name] = {v:v, t:Date.now()}; }, function(){ if (store[name] && store[name].p===p) delete store[name]; }); }
        e = store[name]; if (e && e.p) { var v = await e.p; return v.map(function(o){ return Object.assign({}, o); }); }
      }
      return store[name].v.map(function(o){ return Object.assign({}, o); });
    };
  }
  memo('loadVehicles'); memo('loadItems');
  window.clearMasterCache = function(){ store = {}; };
})();
