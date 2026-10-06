const valid=c=>/^#[0-9a-f]{6}$/i.test(c||'');
const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
export function distinctTransitColor(transit,driving='#369cff') {
  const current=valid(transit)?transit:'#ffac45',other=valid(driving)?driving:'#369cff';
  const difference=c=>Math.hypot(...rgb(c).map((v,i)=>v-rgb(other)[i]));
  if(difference(current)>=135)return current;
  return ['#ffac45','#cf78ff','#46e39c','#40bfff'].sort((a,b)=>difference(b)-difference(a))[0];
}
