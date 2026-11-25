/* Global date display format */
/* Global date display format: "15 Sep 2026, 12:19 PM" (date-only: "15 Sep 2026") */
(function(){
  const M=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const oS=Date.prototype.toLocaleString,oD=Date.prototype.toLocaleDateString,oT=Date.prototype.toLocaleTimeString;
  function d(x){return x.getDate()+" "+M[x.getMonth()]+" "+x.getFullYear();}
  function t(x){let h=x.getHours(),m=String(x.getMinutes()).padStart(2,"0"),ap=h>=12?"PM":"AM";h=h%12||12;return h+":"+m+" "+ap;}
  Date.prototype.toLocaleString=function(l,o){ if(isNaN(this)) return "-"; if(l===undefined&&o===undefined) return d(this)+", "+t(this); return oS.call(this,l,o); };
  Date.prototype.toLocaleDateString=function(l,o){ if(isNaN(this)) return "-"; if(l===undefined&&o===undefined) return d(this); return oD.call(this,l,o); };
  Date.prototype.toLocaleTimeString=function(l,o){ if(isNaN(this)) return "-"; if(o&&o.hour&&!o.second) return t(this); if(l===undefined&&o===undefined) return t(this); return oT.call(this,l,o); };
})();
