export class EventQueue{
  constructor(){this._h=[];this._c=0;}
  get size(){return this._h.length;}get empty(){return!this._h.length;}
  push(e){const ev={...e,_s:this._c++};this._h.push(ev);this._up(this._h.length-1);return ev;}
  pop(){if(!this._h.length)return null;const top=this._h[0];const last=this._h.pop();if(this._h.length){this._h[0]=last;this._dn(0);}return top;}
  peek(){return this._h[0]||null;}
  _lt(a,b){return a.time!==b.time?a.time<b.time:a._s<b._s;}
  _sw(i,j){[this._h[i],this._h[j]]=[this._h[j],this._h[i]];}
  _up(i){while(i>0){const p=(i-1)>>1;if(this._lt(this._h[i],this._h[p])){this._sw(i,p);i=p;}else break;}}
  _dn(i){const n=this._h.length;for(;;){let s=i;const l=2*i+1,r=2*i+2;if(l<n&&this._lt(this._h[l],this._h[s]))s=l;if(r<n&&this._lt(this._h[r],this._h[s]))s=r;if(s!==i){this._sw(i,s);i=s;}else break;}}
}
