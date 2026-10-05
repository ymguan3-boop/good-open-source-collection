// Live output is mono PCM16 LE / 24 kHz. Schedule chunks on the audio clock,
// with a small startup reservoir; never deduplicate identical PCM chunks.
export function createVoicePcmPlayback({getContext,startupSeconds=.12,onDiagnostic=()=>{}}){
  let nextPlayAt=0,carry=null,bufferSeconds=startupSeconds,underruns=0,finished=false;
  const sources=new Set();
  function queue(bytes){
    let data=bytes;
    if(carry!==null){data=new Uint8Array(bytes.length+1);data[0]=carry;data.set(bytes,1);carry=null;}
    if(data.length%2){carry=data[data.length-1];data=data.subarray(0,data.length-1);}
    const sampleCount=data.byteLength/2;if(!sampleCount)return;
    const context=getContext(),view=new DataView(data.buffer,data.byteOffset,data.byteLength);
    const buffer=context.createBuffer(1,sampleCount,24000),samples=new Float32Array(sampleCount);
    for(let i=0;i<sampleCount;i++)samples[i]=view.getInt16(i*2,true)/32768;
    buffer.copyToChannel(samples,0);
    const now=context.currentTime;
    // Silence between complete replies is not a network underrun.
    if(finished && now>=nextPlayAt){nextPlayAt=0;bufferSeconds=startupSeconds;}
    finished=false;
    const hadAudio=nextPlayAt>0,gap=nextPlayAt<now+.005;
    if(hadAudio && gap){underruns++;bufferSeconds=Math.min(.3,bufferSeconds+.04);}
    const at=gap?now+bufferSeconds:nextPlayAt;
    // A fade only at a fresh burst suppresses the discontinuity from silence.
    // Adjacent chunks keep every original sample, with no per-chunk fade/gap.
    if(gap){const fade=Math.min(sampleCount,120);for(let i=0;i<fade;i++)samples[i]*=i/fade;buffer.copyToChannel(samples,0);}
    const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);
    sources.add(source);source.onended=()=>{sources.delete(source);source.disconnect();};
    source.start(at);nextPlayAt=at+buffer.duration;
    onDiagnostic({queuedSeconds:Math.max(0,nextPlayAt-now),underruns,bufferSeconds});
  }
  function stop(){for(const source of sources){try{source.stop();source.disconnect();}catch{}}sources.clear();nextPlayAt=0;carry=null;bufferSeconds=startupSeconds;underruns=0;finished=false;}
  return {queue,stop,finishTurn(){finished=true;},get state(){return {nextPlayAt,activeSources:sources.size,underruns,bufferSeconds,pendingByte:carry!==null};}};
}
