// Offline PayPal adapter tests. All HTTP responses are explicit provider stubs.
import assert from "node:assert/strict";
import { verifyCapture } from "../src/lib/paypal";
const savedFetch=globalThis.fetch;
const savedId=process.env.PAYPAL_CLIENT_ID, savedSecret=process.env.PAYPAL_SECRET;
process.env.PAYPAL_CLIENT_ID="TEST-STUB";process.env.PAYPAL_SECRET="TEST-STUB";
let status=200;
let body: object={};
let pass=0;
globalThis.fetch=async input=>{
 if(String(input).endsWith("/v1/oauth2/token"))return Response.json({access_token:"TEST-STUB-TOKEN",expires_in:3600});
 return Response.json(body,{status});
};
const verify=()=>verifyCapture("TEST-STUB-ORDER","1625.00","merchant@example.invalid","TEST-STUB-DEAL");
const order=(extra:object={})=>({status:"APPROVED",purchase_units:[{custom_id:"TEST-STUB-DEAL",amount:{value:"1625.00",currency_code:"USD"},payee:{email_address:"merchant@example.invalid"},...extra}]});
const check=(name:string,value:boolean)=>{assert.ok(value,name);pass++;console.log("PASS "+name);};
try {
 for(const code of [500,503,429]){
  status=code;body={name:"TEST-STUB-ERROR"};
  await assert.rejects(verify,e=>(e as {status?:number}).status===502);check("Transient lookup "+code+" remains retryable",true);
 }
 status=404;body={};check("Missing order never verifies payment",!(await verify()).ok);
 status=200;body=order();const approved=await verify();check("Valid approved order is still unpaid",!approved.ok&&approved.status==="APPROVED"&&approved.reason==="no capture on order");
 body=order({payee:{email_address:"wrong@example.invalid"}});check("Approved-order payee binding is checked before capture", (await verify()).reason?.includes("binding mismatch")===true);
 body=order({payments:{captures:[{id:"TEST-STUB-CAPTURE",status:"COMPLETED",amount:{value:"1625.00",currency_code:"USD"}}]}});check("Completed bound capture verifies", (await verify()).ok);
 body=order({payments:{captures:[{id:"TEST-STUB-CAPTURE",status:"COMPLETED",amount:{value:"1.00",currency_code:"USD"}}]}});check("Capture amount mismatch is rejected",!(await verify()).ok);
 console.log(JSON.stringify({pass,fail:0,providerMode:"offline HTTP stubs"}));
} finally {
 globalThis.fetch=savedFetch;
 if(savedId===undefined)delete process.env.PAYPAL_CLIENT_ID;else process.env.PAYPAL_CLIENT_ID=savedId;
 if(savedSecret===undefined)delete process.env.PAYPAL_SECRET;else process.env.PAYPAL_SECRET=savedSecret;
}
