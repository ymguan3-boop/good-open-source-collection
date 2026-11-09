import {GoogleGenAI} from '@google/genai';
import {sanitizeGeminiReason} from '../../src/taiwan/geminiLivePolicy.js';
const models=new Set(['gemini-3.8-live','gemini-3.1-flash-live-preview','gemini-2.5-flash-native-audio-latest']);
/** Local-only diagnostic: the long key stays on the provider, no user audio. */
export async function probeGeminiLive(key,model,mode='base'){
 if(!key)throw Error('尚未設定 Gemini 金鑰');if(!models.has(model))throw Error('不支援此診斷模型');
 if(!['base','input','function','search','speech','system'].includes(mode))throw Error('不支援此診斷模式');
 const config={responseModalities:['AUDIO'],outputAudioTranscription:{}};
 if(mode==='input')config.inputAudioTranscription={};
 if(mode==='function')config.tools=[{functionDeclarations:[{name:'get_application_state',description:'取得程式狀態',parameters:{type:'OBJECT',properties:{}}}]}];
 if(mode==='search')config.tools=[{googleSearch:{}}];
 if(mode==='speech')config.speechConfig={voiceConfig:{prebuiltVoiceConfig:{voiceName:'Kore'}}};
 if(mode==='system')config.systemInstruction='請用繁體中文簡短回答';
 const result={model,mode,transport:'backend-standard-key',connected:false,audioChunks:0,transcript:'',startedAt:new Date().toISOString()};
 let session,timer,finish;const done=new Promise(resolve=>finish=resolve);const ai=new GoogleGenAI({apiKey:key,httpOptions:{apiVersion:'v1beta'}});
 timer=setTimeout(()=>{result.error='診斷逾時';finish();},18000);
 try{
  const pending=ai.live.connect({model,config,callbacks:{onmessage:m=>{if(m.setupComplete){result.setupComplete=true;}const content=m.serverContent;if(content?.outputTranscription?.text)result.transcript+=content.outputTranscription.text;if(content?.modelTurn?.parts)result.audioChunks+=content.modelTurn.parts.filter(p=>p.inlineData?.data).length;if(content?.turnComplete)finish();},onclose:e=>{result.close={code:e.code,reason:sanitizeGeminiReason(e.reason)};if(e.code!==1000)result.error=result.close.reason;finish();},onerror:e=>{result.error=sanitizeGeminiReason(e);finish();}}});
  pending.then(value=>{if(result.error)value.close();}).catch(e=>{result.error=sanitizeGeminiReason(e);finish();});
  session=await Promise.race([pending,done.then(()=>null)]);
  if(session){result.connected=true;session.sendClientContent({turns:[{role:'user',parts:[{text:'請用繁體中文簡短說「語音測試成功」。'}]}],turnComplete:true});await done;}
 }catch(e){result.error=sanitizeGeminiReason(e);}
 finally{clearTimeout(timer);session?.close();result.completedAt=new Date().toISOString();}
 return result;
}
