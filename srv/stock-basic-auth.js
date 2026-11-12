import cds from '@sap/cds';
import {createHash,timingSafeEqual} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest();
export default function stockBasicAuth(req,res,next) {
  const fail=()=>res.status(401).json({error:{code:'401',message:'Utilisateur ou mot de passe incorrect.'}});
  const header=req.headers.authorization;
  if(typeof header!=='string'||!/^Basic /i.test(header))return fail();
  const decoded=Buffer.from(header.slice(6),'base64').toString('utf8'),separator=decoded.indexOf(':');
  if(separator<1||decoded.length>2048)return fail();
  const id=decoded.slice(0,separator),password=decoded.slice(separator+1),demo=process.env.STOCK_DEMO_MODE==='true';
  const expected=id==='manager'?(demo?'manager-demo':process.env.STOCK_MANAGER_PASSWORD)
    :id==='viewer'?(demo?'viewer-demo':process.env.STOCK_VIEWER_PASSWORD):null;
  if(!expected||!timingSafeEqual(digest(password),digest(expected)))return fail();
  cds.context.user=req.user=new cds.User({id,roles:[id==='manager'?'Manager':'Viewer']});
  next();
}
