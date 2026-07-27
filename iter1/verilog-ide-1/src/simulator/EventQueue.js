export class EventQueue {
  constructor(){this._heap=[];this._count=0;}
  get size(){return this._heap.length;}
  get empty(){return!this._heap.length;}
  push(e){const ev={...e,_seq:this._count++};this._heap.push(ev);this._up(this._heap.length-1);return ev;}
  pop(){if(!this._heap.length)return null;const top=this._heap[0];const last=this._heap.pop();if(this._heap.length){this._heap[0]=last;this._dn(0);}return top;}
  peek(){return this._heap[0]||null;}
  get currentTime(){return this.peek()?.time??0;}
  _less(a,b){return a.time!==b.time?a.time<b.time:a._seq<b._seq;}
  _swap(i,j){[this._heap[i],this._heap[j]]=[this._heap[j],this._heap[i]];}
  _up(i){while(i>0){const p=(i-1)>>1;if(this._less(this._heap[i],this._heap[p])){this._swap(i,p);i=p;}else break;}}
  _dn(i){const n=this._heap.length;while(true){let s=i;const l=2*i+1,r=2*i+2;if(l<n&&this._less(this._heap[l],this._heap[s]))s=l;if(r<n&&this._less(this._heap[r],this._heap[s]))s=r;if(s!==i){this._swap(i,s);i=s;}else break;}}
}
