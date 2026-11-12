import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import serverless from 'serverless-http';
import {resetBridgeBody} from '../web/request-body.js';
test('Lambda : les paramètres JSON des actions restent des objets',async()=>{
 const app=express();app.use(resetBridgeBody);app.use(express.json());
 app.post('/catalog/recordMovement',(req,res)=>res.json(req.body));
 const input={lotID:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',kind:'OUT',quantity:1,note:'Essai fictif'};
 const result=await serverless(app)({path:'/catalog/recordMovement',httpMethod:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)},{});
 assert.equal(result.statusCode,200);assert.deepEqual(JSON.parse(result.body),input);
});
