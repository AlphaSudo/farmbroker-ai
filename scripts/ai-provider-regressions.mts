// Offline adapter contract tests; no external provider calls.
import assert from "node:assert/strict";
const previous={...process.env};const originalFetch=globalThis.fetch;
process.env.AI_MODEL_PRIMARY="nvidia/TEST-STUB:free";process.env.AI_MODEL_SECONDARY="liquid/TEST-STUB:free";process.env.AI_API_KEY="TEST-STUB";delete process.env.AI_PLANNING;
const calls: Array<Record<string,unknown>>=[];
globalThis.fetch=async (_input,options)=>{
 const body=JSON.parse(String(options?.body));calls.push(body);
 if(String(body.model).startsWith("nvidia/"))return Response.json({error:{code:503}},{status:503});
 if(body.response_format||body.reasoning)return Response.json({error:{code:400}},{status:400});
 return Response.json({model:"liquid/ACTUAL-TEST-STUB:free",choices:[{message:{content:'{"candidate_id":"cost-first","justification":"supplied plan"}'}}]});
};
try{
 const {chatJSON}=await import("../src/lib/ai");
 const result=await chatJSON("Return JSON only","Choose cost-first");
 assert.equal(calls.length,2);console.log("PASS Fallback chain stays bounded to two calls");
 assert.equal(result?.model,"liquid/ACTUAL-TEST-STUB:free");console.log("PASS Actual response model identity is retained");
 assert.equal(JSON.parse(result!.text).candidate_id,"cost-first");console.log("PASS Compatible fallback returns parseable selection");
 assert.equal((calls[0].response_format as {type:string}).type,"json_object");console.log("PASS Primary retains its tested output mode");
 assert.equal(calls[1].response_format,undefined);assert.equal(calls[1].reasoning,undefined);console.log("PASS Fallback avoids incompatible optional parameters");
 process.env.AI_PLANNING="off";assert.equal(await chatJSON("Return JSON","Choose"),null);assert.equal(calls.length,2);console.log("PASS AI-off mode makes no provider call");
 console.log(JSON.stringify({pass:6,fail:0,providerMode:"offline HTTP stubs"}));
}finally{
 globalThis.fetch=originalFetch;
 for(const key of ["AI_MODEL_PRIMARY","AI_MODEL_SECONDARY","AI_API_KEY","AI_PLANNING"]){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
}
