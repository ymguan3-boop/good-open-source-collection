// These are speaking-role presets using documented Gemini Live prebuilt voices.
// Girl/boy describe delivery, not a provider guarantee of a child voice.
export const VOICE_ROLES = Object.freeze([
  Object.freeze({id:'male',name:'男聲',voiceName:'Charon',description:'沉穩親切的男聲角色'}),
  Object.freeze({id:'female',name:'女聲',voiceName:'Aoede',description:'自然溫暖的女聲角色'}),
  Object.freeze({id:'girl',name:'小女孩',voiceName:'Leda',description:'輕柔明亮、帶童趣的角色語氣'}),
  Object.freeze({id:'boy',name:'小男孩',voiceName:'Puck',description:'活潑清楚、帶童趣的角色語氣'}),
]);
export function normalizeVoiceRole(role){return VOICE_ROLES.some(item=>item.id===role)?role:'female';}
export function voiceProfile(role){return VOICE_ROLES.find(item=>item.id===normalizeVoiceRole(role));}
export function voiceStyleInstruction(role){
  const profile=voiceProfile(role);
  return `語音角色：${profile.name}，${profile.description}。用自然的台灣國語聊天語氣，依句意輕重、自然停頓與語調說話，避免逐字念稿、機械式節拍、過度拉高音調或刻意裝可愛。不模仿任何真實人物。${['girl','boy'].includes(profile.id)?'這是虛構的童趣角色語氣，不宣稱自己是真實兒童；地圖操作與資料準確性規則維持相同。':''}`;
}
