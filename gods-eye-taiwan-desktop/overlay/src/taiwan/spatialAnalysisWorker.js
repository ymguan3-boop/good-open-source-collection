import {computeSpatialBatch} from './spatialBatchCore.js';
self.onmessage=async({data})=>{try{const result=await computeSpatialBatch(data,p=>self.postMessage({progress:p}));self.postMessage({result});}catch(error){self.postMessage({error:error.message});}};
