// Fixed application schema; clients cannot provide executable code or arbitrary schemas.
export const AERIAL_FORMAT = 'aerial-parameters-v1';
export const AERIAL_RANGES = Object.freeze({speed:[1,50],pitch:[-85,45],roll:[-20,20],fov:[25,100],lookAhead:[5,500],acceleration:[.5,15],clearance:[3,30],heightIntent:[8,3000]});
const properties=Object.fromEntries(Object.entries(AERIAL_RANGES).map(([name,[minimum,maximum]])=>[name,{type:'number',minimum,maximum}]));
export const AERIAL_RESPONSE_FORMAT={type:'json_schema',json_schema:{name:'aerial_parameters',strict:true,schema:{type:'object',properties:{description:{type:'string'},explanation:{type:'string'},...properties},required:['description','explanation',...Object.keys(properties)],additionalProperties:false}}};
function objects(text){const found=[];let start=-1,depth=0,quoted=false,escaped=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"'){quoted=true;continue;}if(c==='{'){if(!depth)start=i;depth++;}if(c==='}'&&depth&&!--depth)found.push(text.slice(start,i+1));}return found;}
export function parseAerialParameters(text,defaults={}){
  let value;if(text&&typeof text==='object')value=text;else{for(const raw of [String(text||''),...objects(String(text||''))])try{value=JSON.parse(raw);if(value&&typeof value==='object'&&!Array.isArray(value))break;}catch{}}
  value=value?.parameters||value?.plan||value;
  if(!value||typeof value!=='object'||Array.isArray(value)||!Object.keys(AERIAL_RANGES).some(k=>value[k]!==undefined&&value[k]!==null))throw new Error('AI 拍攝參數不是有效 JSON 物件');
  const result={description:typeof value.description==='string'?value.description.slice(0,4000):String(defaults.description||'').slice(0,4000),explanation:typeof value.explanation==='string'?value.explanation.slice(0,2000):''};
  for(const [key,[min,max]]of Object.entries(AERIAL_RANGES)){const raw=value[key]===undefined?defaults[key]:value[key],number=typeof raw==='string'&&/^[-+]?\d+(?:\.\d+)?$/.test(raw.trim())?Number(raw):raw;if(!Number.isFinite(number)||number<min||number>max)throw new Error(`AI 拍攝參數 ${key} 超出允許範圍`);result[key]=number;}
  return result;
}
export function aerialProviderFormat(parameters=[]){return parameters.includes('structured_outputs')?AERIAL_RESPONSE_FORMAT:parameters.includes('response_format')?{type:'json_object'}:null;}
